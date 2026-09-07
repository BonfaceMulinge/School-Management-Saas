import { requirePermission } from "@/server/authorization";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout(
  props: LayoutProps<"/[school]/settings">
) {
  const { school: slug } = await props.params;

  await requirePermission(slug, "settings:view", { next: `/${slug}` });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="School Settings"
        description="Organized configuration for this school — most changes apply immediately and are recorded in the audit log."
      />
      <SettingsNav slug={slug} />
      {props.children}
    </div>
  );
}