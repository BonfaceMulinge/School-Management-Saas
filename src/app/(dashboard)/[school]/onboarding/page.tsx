import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { getSchoolBySlug } from "@/server/services/schools";
import { getOnboardingForSchool } from "@/server/services/onboarding";
import { requirePermission } from "@/server/authorization";
import { db } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";

import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingPage(
  props: PageProps<"/[school]/onboarding">
) {
  const { school: slug } = await props.params;

  await requirePermission(slug, "settings:manage", { next: `/${slug}` });

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [state, classes, subjects] = await Promise.all([
    getOnboardingForSchool(school.id),
    db.class.findMany({
      where: { schoolId: school.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.subject.findMany({
      where: { schoolId: school.id },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (state.completed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Setup complete"
          description={`${school.name} is fully set up. You can always change any of these details later from Settings.`}
        />
        <div className="flex max-w-xl flex-col items-start gap-4 rounded-lg border border-border bg-card p-6">
          <CheckCircle2 className="size-8 text-emerald-600" />
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Onboarding finished</h2>
            <p className="text-sm text-muted-foreground">
              {state.completedAt
                ? `Completed on ${state.completedAt.toLocaleDateString()}.`
                : "Your school profile and academic structure are ready."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/${slug}`}
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Go to dashboard
            </Link>
            <Link
              href={`/${slug}/settings`}
              className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
            >
              Open settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <OnboardingWizard
      slug={slug}
      step={state.currentStep}
      school={school}
      classes={classes}
      subjects={subjects}
    />
  );
}