import { notFound } from "next/navigation";

import { getSchoolBySlug } from "@/server/services/schools";
import { getSchoolSettings } from "@/server/services/school-settings";
import { canAccess } from "@/server/authorization";
import { mergeSchoolSettings } from "@/lib/settings-types";

import { AcademicSettingsForm } from "./academic-settings-form";

export default async function AcademicSettingsPage(
  props: PageProps<"/[school]/settings/academic">
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
    <>
      <AcademicSettingsForm
        slug={slug}
        settings={settings}
        disabled={!canEdit}
      />
      <AcademicLinks slug={slug} />
    </>
  );
}

function AcademicLinks({ slug }: { slug: string }) {
  const links = [
    { title: "Academic years", href: `/${slug}/academic-years`, description: "Manage years and set the active one." },
    { title: "Terms", href: `/${slug}/terms`, description: "Add and activate terms within a year." },
    { title: "Classes", href: `/${slug}/classes`, description: "Classes/grades taught at this school." },
    { title: "Streams", href: `/${slug}/streams`, description: "Divisions within a class." },
    { title: "Subjects", href: `/${slug}/subjects`, description: "Subjects offered at this school." },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted"
        >
          <h3 className="text-sm font-semibold">{link.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{link.description}</p>
        </a>
      ))}
    </section>
  );
}