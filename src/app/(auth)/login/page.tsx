import { GraduationCap } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { APP_NAME } from "@/lib/constants";
import { safeRedirect } from "@/lib/url";
import { getCurrentSession } from "@/server/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Log in",
};

export default async function LoginPage(
  props: PageProps<"/login">
) {
  const searchParams = await props.searchParams;
  const next = safeRedirect(searchParams?.next);

  const session = await getCurrentSession();
  if (session) redirect(next ?? "/");

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-5" aria-hidden="true" />
          </span>
          <p className="text-lg font-semibold tracking-tight">{APP_NAME}</p>
        </div>
        <LoginForm next={next ?? undefined} />
      </div>
    </div>
  );
}