"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/server/db";
import { getSessionConfig } from "@/server/auth/config";
import { getCurrentSession, getSessionToken } from "@/server/auth";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, invalidateSession } from "@/server/auth/session";
import { safeRedirect } from "@/lib/url";
import { createAuditLog } from "@/server/services/audit-log";
import type { Role, PlatformRole } from "@/generated/prisma/client";

export type LoginState = { error?: string; fieldErrors?: Record<string, string[]> } | null;

const loginSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

async function resolvePostLoginTarget(params: {
  next: string | null;
  memberships: { role: Role; school: { slug: string } }[];
  platformRole: PlatformRole | null;
}): Promise<string | null> {
  const { next, memberships, platformRole } = params;

  if (next) {
    const match = /^\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?:\/|$)/i.exec(next);
    const slug = match?.[1];
    if (slug) {
      const inSchool = memberships.some((m) => m.school.slug === slug);
      if (inSchool || platformRole) return next;
    }
  }

  const firstSchool = memberships[0]?.school.slug;
  if (firstSchool) return `/${firstSchool}`;

  if (platformRole) return "/";

  return null;
}

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      platformRole: true,
      mustChangePassword: true,
      memberships: {
        select: { role: true, school: { select: { slug: true } } },
      },
      temporaryPasswordExpiresAt: true,
    },
  });

  if (!user?.passwordHash) {
    // Same message as wrong password to avoid user enumeration.
    return { error: "Invalid email or password." };
  }

  if (user.mustChangePassword && user.temporaryPasswordExpiresAt && user.temporaryPasswordExpiresAt < new Date()) {
    return { error: "This temporary password has expired. Ask the platform administrator to provision a new administrator account." };
  }

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    return { error: "Invalid email or password." };
  }

  const headerStore = await headers();
  const token = await createSession(user.id, {
    userAgent: headerStore.get("user-agent") ?? undefined,
    ipAddress: headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  });

  const cookieStore = await cookies();
  const config = getSessionConfig();
  cookieStore.set(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secure,
    path: "/",
    maxAge: config.cookieMaxAgeSeconds,
  });

  const next = safeRedirect(formData.get("next"));
  const target = await resolvePostLoginTarget({
    next,
    memberships: user.memberships,
    platformRole: user.platformRole,
  });
  if (user.mustChangePassword) {
    redirect(`/first-login${target ? `?next=${encodeURIComponent(target)}` : ""}`);
  }
  if (!target) {
    return {
      error: "Your account is not connected to any school yet.",
    };
  }

  redirect(target);
}

export async function changeFirstLoginPassword(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (newPassword.length < 8) {
    return { fieldErrors: { newPassword: ["Password must be at least 8 characters."] } };
  }
  if (newPassword !== confirmPassword) {
    return { fieldErrors: { confirmPassword: ["Passwords do not match."] } };
  }

  const current = await db.user.findUnique({
    where: { id: session.userId },
    select: { mustChangePassword: true, temporaryPasswordExpiresAt: true },
  });
  if (!current?.mustChangePassword) {
    redirect(safeRedirect(formData.get("next")) ?? "/");
  }
  if (current.temporaryPasswordExpiresAt && current.temporaryPasswordExpiresAt < new Date()) {
    return { error: "This temporary password has expired. Ask the platform administrator to provision a new administrator account." };
  }

  await db.user.update({
    where: { id: session.userId },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: new Date(),
    },
  });
  await db.session.deleteMany({
    where: { userId: session.userId, id: { not: session.id } },
  });
  await createAuditLog({
    actorId: session.userId,
    action: "OTHER",
    entity: "User",
    entityId: session.userId,
    metadata: { operation: "FIRST_LOGIN_PASSWORD_CHANGE" },
  });

  redirect(safeRedirect(formData.get("next")) ?? "/");
}

export async function logout(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    await invalidateSession(token);
  }

  const cookieStore = await cookies();
  cookieStore.delete(getSessionConfig().cookieName);

  redirect("/login");
}