import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Users,
  GraduationCap,
  Wallet,
  MessagesSquare,
  ArrowRight,
} from "lucide-react";

import { getSchoolBySlug } from "@/server/services/schools";
import { requirePermission } from "@/server/authorization";
import { PageHeader } from "@/components/ui/page-header";
import { canAccess } from "@/server/authorization";

export const metadata: Metadata = {
  title: "Report Center",
};

const CATEGORIES = [
  {
    value: "students",
    label: "Students",
    description: "Student lists, enrollments, class/stream and gender distribution.",
    href: "/students",
    icon: Users,
    permission: "students:view",
  },
  {
    value: "academic",
    label: "Academic",
    description: "Exam results, class and subject performance, academic history and grades.",
    href: "/academic",
    icon: GraduationCap,
    permission: "results:view",
  },
  {
    value: "finance",
    label: "Finance",
    description: "Fee collection, outstanding balances, statements and payment activity.",
    href: "/finance",
    icon: Wallet,
    permission: "finance:view",
  },
  {
    value: "communication",
    label: "Communication",
    description: "Announcement reach, message volume and notification activity.",
    href: "/communication",
    icon: MessagesSquare,
    permission: "communication:view",
  },
] as const;

export default async function ReportsPage(props: PageProps<"/[school]/reports">) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const access = await requirePermission(slug, "dashboard:view", { next: `/${slug}` });
  const visibleCategories = (
    await Promise.all(
      CATEGORIES.map(async (category) => ({
        category,
        visible: await canAccess(slug, category.permission),
      }))
    )
  )
    .filter(({ visible }) => visible)
    .map(({ category }) => category);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Report Center"
        description="Cross-module reports with print, PDF and CSV export. Every report respects your access scope — parents see linked children, teachers their classes, students their own records."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCategories.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.value}
              href={`/${slug}/reports${c.href}`}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">{c.label}</h2>
                <p className="text-sm text-muted-foreground">{c.description}</p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                Open reports
                <ArrowRight
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Signed in as {access.user.name} · School scope: {school.name}
      </p>
    </div>
  );
}