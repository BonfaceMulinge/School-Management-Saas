import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { createAuditLog } from "@/server/services/audit-log";
import type { Role } from "@/generated/prisma/client";

export type ProvisionResult =
  | { ok: true; userId: string; email: string; created: boolean; passwordSet: boolean }
  | { ok: false; error: string };

/**
 * Provision the first SCHOOL_ADMIN for a school (or link an existing account).
 *
 * - Reuses an existing platform User by email — never creates a duplicate.
 * - Only sets a passwordHash when the account has none (never overwrites a
 *   working password). The plaintext password exists only in the caller's
 *   request and is never stored, returned, or logged.
 * - Never touches `platformRole`. Platform roles are assigned exclusively via
 *   the platform admin console (`setPlatformRoleAction`).
 * - The SCHOOL_ADMIN membership is upserted (unique per school+user), so a
 *   duplicate administrator account is impossible.
 *
 * Returns `ok:false` when the existing account already holds a different,
 * school-scoped role — promoting those is a deliberate, auditable decision the
 * platform admin makes elsewhere.
 */
export async function provisionSchoolAdmin(data: {
  schoolId: string;
  email: string;
  name?: string | null;
  password?: string;
}): Promise<ProvisionResult> {
  const email = data.email.trim().toLowerCase();
  const school = await db.school.findUnique({
    where: { id: data.schoolId },
    select: { id: true },
  });
  if (!school) return { ok: false, error: "School not found." };

  let user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, passwordHash: true },
  });

  let created = false;
  let passwordSet = false;
  if (!user) {
    user = await db.user.create({
      data: { email, name: data.name?.trim() || null },
      select: { id: true, name: true, passwordHash: true },
    });
    created = true;
    if (data.password) {
      user = await db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(data.password) },
        select: { id: true, name: true, passwordHash: true },
      });
      passwordSet = true;
    }
  } else if (!user.passwordHash && data.password) {
    user = await db.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(data.password) },
      select: { id: true, name: true, passwordHash: true },
    });
    passwordSet = true;
  }

  const existing = await db.membership.findUnique({
    where: { schoolId_userId: { schoolId: data.schoolId, userId: user.id } },
    select: { role: true },
  });
  if (existing && existing.role !== "SCHOOL_ADMIN") {
    return {
      ok: false,
      error: `That account is already a ${existing.role} member of this school. Change their role first.`,
    };
  }
  if (!existing) {
    await db.membership.create({
      data: { schoolId: data.schoolId, userId: user.id, role: "SCHOOL_ADMIN" as Role },
    });
  }

  return {
    ok: true,
    userId: user.id,
    email,
    created,
    passwordSet,
  };
}

/** Convenience wrapper used by the platform admin action (adds audit entry). */
export async function provisionSchoolAdminWithAudit(data: {
  actorId: string;
  schoolId: string;
  email: string;
  name?: string | null;
  password?: string;
}): Promise<ProvisionResult> {
  const result = await provisionSchoolAdmin(data);
  if (result.ok) {
    await createAuditLog({
      actorId: data.actorId,
      schoolId: data.schoolId,
      action: "SCHOOL_ADMIN_PROVISION",
      entity: "School",
      entityId: data.schoolId,
      metadata: {
        email: result.email,
        name: data.name?.trim() || null,
        role: "SCHOOL_ADMIN",
        outcome: result.created ? "created" : "linked",
        passwordSet: result.passwordSet,
      },
    });
  }
  return result;
}