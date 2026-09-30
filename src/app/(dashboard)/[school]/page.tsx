import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  BookOpen,
  ClipboardList,
  GraduationCap,
  Layers,
  UserPlus,
  Wallet,
} from "lucide-react";

import { db } from "@/server/db";
import { requirePermission, canAccess } from "@/server/authorization";
import { getSchoolBySlug } from "@/server/services/schools";
import { financeStudentsScopeWhere } from "@/server/services/finance";
import { studentsScopeWhere } from "@/server/services/students";
import { staffScopeWhere } from "@/server/services/staff";
import { unreadNotificationCount } from "@/server/services/communication";
import { formatDate, formatMoney } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const quickLinks = [
  {
    title: "Students",
    description: "Records, fee status and enrollment history.",
    icon: GraduationCap,
    href: "students",
    permission: "students:view" as const,
  },
  {
    title: "Admissions",
    description: "Enroll new students into year, term, level and stream.",
    icon: UserPlus,
    href: "admissions",
    permission: "enrollments:view" as const,
  },
  {
    title: "Academics",
    description: "Levels, streams, terms, subjects and pathways.",
    icon: BookOpen,
    href: "classes",
    permission: "classes:view" as const,
  },
  {
    title: "Exams & Marks",
    description: "Enter and review continuous assessment marks.",
    icon: ClipboardList,
    href: "exams",
    permission: "exams:view" as const,
  },
  {
    title: "Report Cards",
    description: "Generate individual and bulk report cards.",
    icon: Layers,
    href: "results/report-cards",
    permission: "results:view" as const,
  },
  {
    title: "Fees & Finance",
    description: "Structures, payments and statements.",
    icon: Wallet,
    href: "finance/structures",
    permission: "finance:view" as const,
  },
];

function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tracking-tight">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="pt-0 text-xs text-muted-foreground">
          <p>{hint}</p>
        </CardContent>
      ) : null}
    </Card>
  );
  return href ? (
    <Link href={href} className="transition-opacity hover:opacity-80">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default async function SchoolDashboardPage(props: PageProps<"/[school]">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "dashboard:view", { next: `/${slug}` });

  const {
    finance,
    academics,
    students,
    staff,
    enrollments,
    communication,
  } = {
    finance: await canAccess(slug, "finance:view"),
    academics: await canAccess(slug, "classes:view"),
    students: await canAccess(slug, "students:view"),
    staff: await canAccess(slug, "staff:view"),
    enrollments: await canAccess(slug, "enrollments:view"),
    communication: await canAccess(slug, "communication:view"),
  };

  const activeYear = academics
    ? await db.academicYear.findFirst({
        where: { schoolId: access.schoolId, archived: false, isActive: true },
        select: { id: true, name: true },
        orderBy: { startDate: "desc" },
      })
    : null;
  const activeTerm = activeYear
    ? await db.term.findFirst({
        where: { academicYearId: activeYear.id, archived: false, isActive: true },
        select: { id: true, name: true },
      })
    : null;

  const studentWhere = students ? await studentsScopeWhere(access) : null;
  const staffWhere = staff ? await staffScopeWhere(access) : null;
  const financeScope = finance
    ? {
        schoolId: access.schoolId,
        student: await financeStudentsScopeWhere(access),
        ...(activeYear ? { academicYearId: activeYear.id } : {}),
      }
    : null;

  const [
    studentCount,
    staffCount,
    classCount,
    streamCount,
    financeSummary,
    recentAdmissions,
    recentPayments,
    unread,
  ] = await Promise.all([
    studentWhere ? db.student.count({ where: studentWhere }) : Promise.resolve(0),
    staffWhere ? db.staff.count({ where: staffWhere }) : Promise.resolve(0),
    academics ? db.class.count({ where: { schoolId: access.schoolId, archived: false } }) : Promise.resolve(0),
    academics
      ? db.stream.count({
          where: { class: { schoolId: access.schoolId, archived: false }, archived: false },
        })
      : Promise.resolve(0),
    financeScope
      ? (async () => {
          const [billedAgg, collectedAgg] = await Promise.all([
            db.studentCharge.aggregate({ _sum: { amount: true }, where: financeScope }),
            db.feePayment.aggregate({
              _sum: { amount: true },
              where: { ...financeScope, status: "APPLIED" },
            }),
          ]);
          const billed = billedAgg._sum.amount?.toNumber() ?? 0;
          const collected = collectedAgg._sum.amount?.toNumber() ?? 0;
          return { billed, collected, outstanding: Math.max(0, billed - collected) };
        })()
      : Promise.resolve(null),
    enrollments
      ? db.enrollment.findMany({
          where: { schoolId: access.schoolId },
          include: {
            student: { select: { id: true, firstName: true, middleName: true, lastName: true, studentNo: true } },
            class: { select: { name: true } },
            stream: { select: { name: true } },
            academicYear: { select: { name: true } },
            term: { select: { name: true } },
          },
          orderBy: { enrolledAt: "desc" },
          take: 6,
        })
      : Promise.resolve([]),
    financeScope
      ? db.feePayment.findMany({
          where: { ...financeScope, status: "APPLIED" },
          include: { student: { select: { firstName: true, middleName: true, lastName: true } } },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 6,
        })
      : Promise.resolve([]),
    communication ? unreadNotificationCount(access.schoolId, access.user.id) : Promise.resolve(0),
  ]);

  const visibleQuickLinks = (
    await Promise.all(
      quickLinks.map(async (link) => ({
        link,
        visible: await canAccess(slug, link.permission),
      }))
    )
  )
    .filter(({ visible }) => visible)
    .map(({ link }) => link);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {school.name}
          {activeYear ? (
            <span className="ml-2">
              <Badge variant="secondary" className="ml-1">
                {activeYear.name}
              </Badge>
              {activeTerm ? (
                <Badge variant="secondary" className="ml-1">
                  {activeTerm.name}
                </Badge>
              ) : null}
            </span>
          ) : null}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Students"
          value={studentWhere ? studentCount : "—"}
          href={students ? `/${slug}/students` : undefined}
        />
        <StatCard
          label="Teachers & Staff"
          value={staffWhere ? staffCount : "—"}
          href={staff ? `/${slug}/staff` : undefined}
        />
        <StatCard
          label="Classes & Streams"
          value={academics ? `${classCount} · ${streamCount}` : "—"}
          hint={academics ? `${classCount} classes / levels · ${streamCount} streams` : undefined}
          href={academics ? `/${slug}/classes` : undefined}
        />
        <StatCard
          label="Outstanding Fees"
          value={financeSummary ? formatMoney(financeSummary.outstanding, school.currency) : "—"}
          hint={financeSummary ? "Current academic year" : undefined}
          href={finance ? `/${slug}/finance/statements` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="size-5 text-primary" aria-hidden="true" />
                Recent Admissions
              </CardTitle>
              {enrollments ? (
                <Link
                  href={`/${slug}/admissions`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              ) : null}
            </div>
          </CardHeader>
          {recentAdmissions.length > 0 ? (
            <ul className="divide-y divide-border border-t border-border">
              {recentAdmissions.map((en) => (
                <li key={en.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">
                      {`${en.student.firstName} ${en.student.middleName ?? ""} ${en.student.lastName}`.trim()}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {en.student.studentNo ?? ""}
                    </span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {en.class.name}
                      {en.stream ? ` · ${en.stream.name}` : ""} · {en.academicYear.name}
                      {en.term ? ` · ${en.term.name}` : ""}
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                    {formatDate(en.enrolledAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <CardContent>
              <EmptyState
                icon={UserPlus}
                title="No admissions yet"
                description="Enrolled students will appear here."
              />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wallet className="size-5 text-primary" aria-hidden="true" />
                Recent Payments
              </CardTitle>
              {finance ? (
                <Link
                  href={`/${slug}/finance/payments`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              ) : null}
            </div>
          </CardHeader>
          {recentPayments.length > 0 ? (
            <ul className="divide-y divide-border border-t border-border">
              {recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{p.receiptNo}</span>
                    <span className="ml-2 text-muted-foreground">
                      {`${p.student.firstName} ${p.student.lastName}`.trim()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {p.date.toISOString().slice(0, 10)}
                    </span>
                    <span className="font-medium">{formatMoney(p.amount.toNumber(), school.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <CardContent>
              <EmptyState
                icon={Wallet}
                title="No payments yet"
                description="Recorded receipts will appear here."
              />
            </CardContent>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-label="Quick access" className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Quick access</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleQuickLinks.map((link) => (
              <Link key={link.title} href={`/${slug}/${link.href}`}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader>
                    <link.icon className="size-5 text-primary" aria-hidden="true" />
                    <CardTitle className="text-base">{link.title}</CardTitle>
                    <CardDescription>{link.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="size-5 text-primary" aria-hidden="true" />
              Notifications
            </CardTitle>
            <CardDescription>Updates for your account.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {unread > 0 ? (
                <span>
                  You have <span className="font-semibold text-foreground">{unread}</span> unread{" "}
                  {unread === 1 ? "notification" : "notifications"}.
                </span>
              ) : (
                "You're all caught up."
              )}
            </p>
            {communication ? (
              <Button render={<Link href={`/${slug}/communication/notifications`} />} variant="outline" size="sm">
                Open notifications
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}