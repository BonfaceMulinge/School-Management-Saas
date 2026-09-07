import { notFound } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  GraduationCap,
  Megaphone,
  Users,
  Wallet,
} from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { financeStudentsScopeWhere } from "@/server/services/finance";
import { formatMoney } from "@/lib/format";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const modules = [
  {
    title: "Students",
    description: "Student records, enrollment and guardians.",
    icon: GraduationCap,
    href: "students",
    phase: "Live",
  },
  {
    title: "Teachers",
    description: "Teacher profiles, assignments and workload.",
    icon: Users,
    phase: "Live",
    href: "teachers",
  },
  {
    title: "Academics",
    description: "Subjects and exam/results module.",
    icon: BookOpen,
    phase: "Live",
    href: "subjects",
  },
  {
    title: "Communication",
    description: "Announcements, messages, notifications and events.",
    icon: Megaphone,
    phase: "Live",
    href: "communication/announcements",
  },
  {
    title: "Reports",
    description: "Dashboards and exports for every audience.",
    icon: BarChart3,
    phase: "Live",
    href: "reports",
  },
];

export default async function SchoolDashboardPage(props: PageProps<"/[school]">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [access, canViewFinance] = await Promise.all([
    requirePermission(slug, "dashboard:view", { next: `/${slug}` }),
    canAccess(slug, "finance:view"),
  ]);

  const selfScoped =
    !access.isPlatformStaff &&
    (access.membership?.role === "PARENT" || access.membership?.role === "STUDENT");

  let finance: { billed: number; adjusted: number; collected: number; outstanding: number; recent: { id: string; receiptNo: string; studentName: string; amount: number; date: Date }[] } | null = null;

  if (canViewFinance && access) {
    const activeYear = await db.academicYear.findFirst({
      where: { schoolId: access.schoolId, archived: false, isActive: true },
      orderBy: { startDate: "desc" },
      select: { id: true },
    });
    const studentScope = await financeStudentsScopeWhere(access);
    const financeScope = {
      schoolId: access.schoolId,
      student: studentScope,
      ...(activeYear ? { academicYearId: activeYear.id } : {}),
    };
    const [billedAgg, adjustedAgg, collectedAgg, recent] = await Promise.all([
      db.studentCharge.aggregate({
        _sum: { amount: true },
        where: financeScope,
      }),
      db.chargeAdjustment.aggregate({
        _sum: { amount: true },
        where: {
          schoolId: access.schoolId,
          charge: activeYear
            ? { schoolId: access.schoolId, academicYearId: activeYear.id, student: studentScope }
            : { schoolId: access.schoolId, student: studentScope },
        },
      }),
      db.feePayment.aggregate({
        _sum: { amount: true },
        where: { ...financeScope, status: "APPLIED" },
      }),
      db.feePayment.findMany({
        where: {
          schoolId: access.schoolId,
          student: studentScope,
          ...(activeYear ? { academicYearId: activeYear.id } : {}),
          status: "APPLIED",
        },
        include: { student: { select: { firstName: true, middleName: true, lastName: true } } },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: 5,
      }),
    ]);
    const billed = billedAgg._sum.amount?.toNumber() ?? 0;
    const adjusted = adjustedAgg._sum.amount?.toNumber() ?? 0;
    const collected = collectedAgg._sum.amount?.toNumber() ?? 0;
    finance = {
      billed,
      adjusted,
      collected,
      outstanding: Math.max(0, billed - adjusted - collected),
      recent: recent.map((p) => ({
        id: p.id,
        receiptNo: p.receiptNo,
        studentName: `${p.student.firstName} ${p.student.lastName}`,
        amount: p.amount.toNumber(),
        date: p.date,
      })),
    };
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p className="text-muted-foreground">
          {school ? school.name : ""} — manage your school&apos;s daily operations.
        </p>
      </div>

      {canViewFinance && finance ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="size-5 text-primary" aria-hidden="true" />
                Fee collection
              </CardTitle>
              <Link
                href={
                  selfScoped
                    ? `/${slug}/finance/statements`
                    : `/${slug}/finance/payments`
                }
                className="text-sm font-medium text-primary hover:underline"
              >
                {selfScoped ? "View statement →" : "Record payment →"}
              </Link>
            </div>
            <CardDescription>
              {finance.recent.length > 0
                ? "Latest receipts and outstanding balance."
                : "No payments recorded yet."}
            </CardDescription>
          </CardHeader>
          <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Billed</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(finance.billed, school.currency)}</p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Adjusted</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(finance.adjusted, school.currency)}</p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Collected</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-600">
                {formatMoney(finance.collected, school.currency)}
              </p>
            </div>
            <div className="bg-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="mt-1 text-2xl font-semibold text-destructive">
                {formatMoney(finance.outstanding, school.currency)}
              </p>
            </div>
          </div>
          {finance.recent.length > 0 ? (
            <ul className="divide-y divide-border border-t border-border">
              {finance.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{r.receiptNo}</span>
                    <span className="ml-2 text-muted-foreground">{r.studentName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {r.date.toISOString().slice(0, 10)}
                    </span>
                    <span className="font-medium">{formatMoney(r.amount, school.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}

      <section aria-label="Modules">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <Wallet className="size-5 text-primary" aria-hidden="true" />
              <CardTitle className="text-base">Finance</CardTitle>
              <CardDescription>
                Fee structures, charges, payments and statements.
              </CardDescription>
              <Link
                href={`/${slug}/${selfScoped ? "finance/statements" : "finance/structures"}`}
                className="mt-2 w-fit rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
              >
                Open
              </Link>
            </CardHeader>
          </Card>
          {modules.map((module) => (
            <Card key={module.title}>
              <CardHeader>
                <module.icon className="size-5 text-primary" aria-hidden="true" />
                <CardTitle className="text-base">{module.title}</CardTitle>
                <CardDescription>{module.description}</CardDescription>
                {module.href ? (
                  <Link
                    href={`/${slug}/${module.href}`}
                    className="mt-2 w-fit rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
                  >
                    Open
                  </Link>
                ) : (
                  <Badge variant="outline" className="mt-2 w-fit rounded-full text-[10px] font-normal">
                    {module.phase}
                  </Badge>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

<p className="text-sm text-muted-foreground">
        Communication, exams, results, finance and reports live.
      </p>
    </div>
  );
}