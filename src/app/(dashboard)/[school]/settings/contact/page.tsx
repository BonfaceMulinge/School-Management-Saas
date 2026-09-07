import { notFound } from "next/navigation";

import { getSchoolBySlug } from "@/server/services/schools";
import { canAccess } from "@/server/authorization";

import { ContactSettingsForm } from "./contact-settings-form";

export default async function ContactSettingsPage(
  props: PageProps<"/[school]/settings/contact">
) {
  const { school: slug } = await props.params;

  const school = await getSchoolBySlug(slug);
  if (!school) notFound();

  const canEdit = await canAccess(slug, "settings:manage");

  return (
    <ContactSettingsForm
      slug={slug}
      school={{
        email: school.email ?? "",
        phone: school.phone ?? "",
        address: school.address ?? "",
      }}
      disabled={!canEdit}
    />
  );
}