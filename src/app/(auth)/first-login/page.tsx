import { redirect } from "next/navigation";

import { FirstLoginForm } from "@/components/auth/first-login-form";
import { getCurrentSession } from "@/server/auth";
import { safeRedirect } from "@/lib/url";

export const metadata = { title: "Set your password" };

export default async function FirstLoginPage(props: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await props.searchParams;
  const next = safeRedirect(params?.next);
  const session = await getCurrentSession();
  if (!session) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (!session.user.mustChangePassword) redirect(next ?? "/");

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your temporary administrator password must be replaced before you continue.
        </p>
        <div className="mt-6">
          <FirstLoginForm next={next ?? undefined} />
        </div>
      </div>
    </div>
  );
}