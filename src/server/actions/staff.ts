"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { getStaffInSchool } from "@/server/services/staff";
import { mappedMembershipRole } from "@/server/services/staff";
import { createAuditLog } from "@/server/services/audit-log";
import { assertUsageCapacityTx, UsageLimitError } from "@/server/services/subscription-enforcement";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { fullName } from "@/lib/students";
import { Prisma, type Role, type StaffRole, type StaffStatus } from "@/generated/prisma/client";

const roleEnum = z.enum(["TEACHER", "SCHOOL_ADMIN", "ACCOUNTANT", "SUPPORT_STAFF", "OTHER"]);
const statusEnum = z.enum(["ACTIVE", "INACTIVE"]);

function staffSchema() {
  return z.object({
    firstName: z.string().trim().min(1, "First name is required.").max(120),
    middleName: z.string().trim().max(120).optional().or(z.literal("")),
    lastName: z.string().trim().min(1, "Last name is required.").max(120),
    staffNo: z.string().trim().max(40).optional().or(z.literal("")),
    role: roleEnum.default("TEACHER"),
    phone: z.string().trim().max(60).optional().or(z.literal("")),
    dateJoined: z.coerce.date().optional().catch(undefined),
    department: z.string().trim().max(120).optional().or(z.literal("")),
    position: z.string().trim().max(120).optional().or(z.literal("")),
    status: statusEnum.optional().default("ACTIVE"),
  });
}

type StaffInput = z.infer<ReturnType<typeof staffSchema>>;

function optionalString(v: string | null | undefined): string | null {
  return v ? v : null;
}

async function assertStaffNoAvailable(
  schoolId: string,
  staffNo: string,
  excludeId?: string
) {
  if (!staffNo) return true;
  const existing = await db.staff.findUnique({
    where: { schoolId_staffNo: { schoolId, staffNo } },
    select: { id: true },
  });
  return !existing || existing.id === excludeId;
}

/**
 * Reuse the platform User by email when one exists; otherwise create the User
 * record (never a duplicate). The account is optional — staff records can be
 * unlinked — but when an email is given the profile's identity comes from it,
 * mirroring how parent accounts are created.
 */
async function resolveLinkedUser(
  email: string,
  name: string
): Promise<string> {
  let user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    user = await db.user.create({
      data: { email, name },
      select: { id: true },
    });
  }
  return user.id;
}

/** Upsert the school Membership role that matches a staff employment role. */
async function upsertMembership(
  client: Prisma.TransactionClient | typeof db,
  schoolId: string,
  userId: string,
  staffRole: StaffRole
) {
  const role: Role = mappedMembershipRole(staffRole);
  await client.membership.upsert({
    where: { schoolId_userId: { schoolId, userId } },
    update: { role },
    create: { schoolId, userId, role },
  });
}

/** True when the schema's account section was toggled on by the form. */
function accountToggle(input: FormData, key: string): boolean {
  return input.get(key) === "on" || input.get(key) === "true";
}

function staffData(data: StaffInput) {
  return {
    firstName: data.firstName,
    middleName: optionalString(data.middleName),
    lastName: data.lastName,
    staffNo: optionalString(data.staffNo),
    role: data.role as StaffRole,
    phone: optionalString(data.phone),
    dateJoined: data.dateJoined,
    department: optionalString(data.department),
    position: optionalString(data.position),
    status: (data.status as StaffStatus | undefined) ?? "ACTIVE",
  };
}

function revalidatePaths(slug: string) {
  revalidatePath(`/${slug}/staff`);
  revalidatePath(`/${slug}/teachers`);
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export async function createStaff(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "staff:manage");

  const wantAccount = accountToggle(input, "createAccount");
  const parsed = staffSchema().safeParse({
    firstName: input.get("firstName"),
    middleName: input.get("middleName"),
    lastName: input.get("lastName"),
    staffNo: input.get("staffNo"),
    role: input.get("role") || undefined,
    phone: input.get("phone"),
    dateJoined: input.get("dateJoined") || undefined,
    department: input.get("department"),
    position: input.get("position"),
    status: input.get("status") || undefined,
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data as StaffInput;

  let userId: string | null = null;
  if (wantAccount) {
    const accountEmail = z
      .email("Enter a valid email address.")
      .trim()
      .toLowerCase()
      .safeParse(input.get("accountEmail"));
    if (!accountEmail.success) {
      return fail("Enter a valid email address for the account.", {
        accountEmail: ["Enter a valid email address."],
      });
    }
    // Reuse the platform User by email when one exists; otherwise create it.
    userId = await resolveLinkedUser(
      accountEmail.data,
      fullName(data.firstName, optionalString(data.middleName), data.lastName)
    );
  }

  if (!(await assertStaffNoAvailable(access.schoolId, data.staffNo ?? ""))) {
    return fail("A staff member with this staff number already exists.", {
      staffNo: ["Staff number must be unique within the school."],
    });
  }

  const createData = { ...staffData(data), schoolId: access.schoolId, userId };

  let createdId: string;
  if (access.isPlatformStaff) {
    // Platform staff (Super Admin triaging a tenant) are never blocked by the
    // plan's usage limits; school-level users are.
    const created = await db.staff.create({ data: createData, select: { id: true } });
    createdId = created.id;
    if (userId !== null) await upsertMembership(db, access.schoolId, userId, createData.role);
  } else {
    try {
      createdId = await db.$transaction(
        async (tx) => {
          // Count + insert run inside one Serializable transaction so
          // concurrent staff creates cannot bypass the plan's staff limit.
          await assertUsageCapacityTx(tx, access.schoolId, "staff");
          const created = await tx.staff.create({ data: createData, select: { id: true } });
          if (userId !== null) {
            await upsertMembership(tx, access.schoolId, userId, createData.role);
          }
          return created.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err) {
      if (err instanceof UsageLimitError) return fail(err.message);
      if (isUniqueViolation(err)) {
        return fail("A staff member with this staff number already exists.", {
          staffNo: ["Staff number must be unique within the school."],
        });
      }
      throw err;
    }
  }

  await createAuditLog({
    schoolId: access.schoolId,
    actorId: access.user.id,
    action: "STAFF_CREATE",
    entity: "Staff",
    entityId: createdId,
    metadata: {
      role: createData.role,
      staffNo: createData.staffNo,
      accountLinked: userId !== null,
    },
  });

  revalidatePaths(schoolSlug);
  return ok({ id: createdId });
}

export async function updateStaff(
  schoolSlug: string,
  staffId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "staff:manage");

  const existing = await getStaffInSchool(access.schoolId, staffId);
  if (!existing) return fail("Staff member not found.");

  const wantAccount = accountToggle(input, "updateAccount");
  const parsed = staffSchema().safeParse({
    firstName: input.get("firstName"),
    middleName: input.get("middleName"),
    lastName: input.get("lastName"),
    staffNo: input.get("staffNo"),
    role: input.get("role") || undefined,
    phone: input.get("phone"),
    dateJoined: input.get("dateJoined") || undefined,
    department: input.get("department"),
    position: input.get("position"),
    status: input.get("status") || undefined,
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data as StaffInput;

  let userId = existing.userId;
  if (wantAccount) {
    const accountEmail = z
      .email("Enter a valid email address.")
      .trim()
      .toLowerCase()
      .safeParse(input.get("accountEmail"));
    if (!accountEmail.success) {
      return fail("Enter a valid email address for the account.", {
        accountEmail: ["Enter a valid email address."],
      });
    }
    userId = await resolveLinkedUser(
      accountEmail.data,
      fullName(data.firstName, optionalString(data.middleName), data.lastName)
    );
  }

  if (!(await assertStaffNoAvailable(access.schoolId, data.staffNo ?? "", staffId))) {
    return fail("A staff member with this staff number already exists.", {
      staffNo: ["Staff number must be unique within the school."],
    });
  }

  const updateData = { ...staffData(data), userId };

  try {
    await db.$transaction(async (tx) => {
      await tx.staff.update({ where: { id: staffId }, data: updateData });
      if (userId !== null) {
        await upsertMembership(tx, access.schoolId, userId, updateData.role);
      }
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail("A staff member with this staff number already exists.", {
        staffNo: ["Staff number must be unique within the school."],
      });
    }
    throw err;
  }

  await createAuditLog({
    schoolId: access.schoolId,
    actorId: access.user.id,
    action: "STAFF_UPDATE",
    entity: "Staff",
    entityId: staffId,
    metadata: {
      role: updateData.role,
      staffNo: updateData.staffNo,
      status: updateData.status,
    },
  });

  revalidatePaths(schoolSlug);
  revalidatePath(`/${schoolSlug}/staff/${staffId}`);
  return ok();
}

export async function archiveStaff(
  schoolSlug: string,
  staffId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "staff:manage");

  const existing = await getStaffInSchool(access.schoolId, staffId);
  if (!existing) return fail("Staff member not found.");
  if (existing.archived) return fail("This staff member is already archived.");

  // Never strand a school without an active school administrator.
  if (existing.role === "SCHOOL_ADMIN") {
    const [otherStaffAdmins, otherAdminMemberships] = await Promise.all([
      db.staff.count({
        where: {
          schoolId: access.schoolId,
          role: "SCHOOL_ADMIN",
          archived: false,
          status: "ACTIVE",
          id: { not: staffId },
        },
      }),
      existing.userId
        ? db.membership.count({
            where: {
              schoolId: access.schoolId,
              role: "SCHOOL_ADMIN",
              userId: { not: existing.userId },
            },
          })
        : db.membership.count({
            where: { schoolId: access.schoolId, role: "SCHOOL_ADMIN" },
          }),
    ]);
    if (otherStaffAdmins + otherAdminMemberships === 0) {
      return fail("The school must retain at least one active school administrator.");
    }
  }

  const mappedRole = mappedMembershipRole(existing.role);

  await db.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id: staffId },
      data: { archived: true, status: "INACTIVE" },
    });

    // Archived staff are no longer active users: revoke the membership that
    // matched their employment role so they cannot keep signing in with a
    // staff role. Unrelated memberships (e.g. PARENT) are left untouched.
    if (existing.userId) {
      await tx.membership.deleteMany({
        where: {
          schoolId: access.schoolId,
          userId: existing.userId,
          role: mappedRole,
        },
      });
    }
  });

  await createAuditLog({
    schoolId: access.schoolId,
    actorId: access.user.id,
    action: "STAFF_ARCHIVE",
    entity: "Staff",
    entityId: staffId,
    metadata: { role: existing.role },
  });

  revalidatePaths(schoolSlug);
  revalidatePath(`/${schoolSlug}/staff/${staffId}`);
  return ok();
}