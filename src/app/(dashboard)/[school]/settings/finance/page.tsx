import { notFound } from "next/navigation";

import { getSchoolBySlug } from "@/server/services/schools";
import { getSchoolSettings } from "@/server/services/school-settings";
import { canAccess } from "@/server/authorization";
import { mergeSchoolSettings } from "@/lib/settings-types";

import { FinanceSettingsForm } from "./finance-settings-form";

export default async function FinanceSettingsPage(
  props: PageProps<"/[school]/settings/finance">
) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const [settingsRow, canEdit] = await Promise.all([
    getSchoolSettings(school.id),
    canAccess(slug, "settings:manage"),
  ]);
  const settings = mergeSchoolSettings(settingsRow);

  return (
    <FinanceSettingsForm
      slug={slug}
      currency={school.currency}
      settings={settings}
      disabled={!canEdit}
    />
  );
}