import { notFound } from "next/navigation";

import { getSchoolBySlug } from "@/server/services/schools";
import { getSchoolSettings } from "@/server/services/school-settings";
import { canAccess } from "@/server/authorization";
import { mergeSchoolSettings } from "@/lib/settings-types";

import { CommunicationSettingsForm } from "./communication-settings-form";

export default async function CommunicationSettingsPage(
  props: PageProps<"/[school]/settings/communication">
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
    <CommunicationSettingsForm slug={slug} settings={settings} disabled={!canEdit} />
  );
}