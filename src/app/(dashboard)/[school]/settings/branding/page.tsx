import { notFound } from "next/navigation";

import { getSchoolBySlug } from "@/server/services/schools";
import { canAccess } from "@/server/authorization";

import { BrandingSettingsForm } from "./branding-settings-form";

export default async function BrandingSettingsPage(
  props: PageProps<"/[school]/settings/branding">
) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const canEdit = await canAccess(slug, "settings:manage");

  return (
    <BrandingSettingsForm
      slug={slug}
      school={{
        motto: school.motto ?? "",
        website: school.website ?? "",
        logoUrl: school.logoUrl ?? "",
        primaryColor: school.primaryColor ?? "#2563eb",
      }}
      disabled={!canEdit}
    />
  );
}