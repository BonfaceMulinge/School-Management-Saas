"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { getStudentInSchool } from "@/server/services/students";
import { assertUsageCapacityTx, UsageLimitError } from "@/server/services/subscription-enforcement";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { Prisma, type Gender, type StudentStatus } from "@/generated/prisma/client";

const genderEnum = z.enum(["MALE", "FEMALE", "OTHER"]);
const statusEnum = z.enum(["ACTIVE", "SUSPENDED", "WITHDRAWN"]);

function studentSchema() {
  return z.object({
    firstName: z.string().trim().min(1, "First name is required.").max(120),
    middleName: z.string().trim().max(120).optional().or(z.literal("")),
    lastName: z.string().trim().min(1, "Last name is required.").max(120),
    gender: z
      .union([genderEnum, z.literal("")])
      .optional()
      .transform((v) => (v === "" || !v ? null : (v as Gender))),
    dateOfBirth: z.coerce.date().optional().catch(undefined),
    studentNo: z.string().trim().max(40).optional().or(z.literal("")),
    admissionDate: z.coerce.date().optional().catch(undefined),
    status: statusEnum.optional().default("ACTIVE"),
    photoUrl: z
      .union([z.url({ error: "Enter a valid photo URL." }), z.literal("")])
      .optional()
      .transform((v) => (v === "" || !v ? null : v)),
    address: z.string().trim().max(300).optional().or(z.literal("")),
    phone: z.string().trim().max(60).optional().or(z.literal("")),
    emergencyContactName: z.string().trim().max(120).optional().or(z.literal("")),
    emergencyContactPhone: z.string().trim().max(60).optional().or(z.literal("")),
    emergencyContactRelation: z.string().trim().max(60).optional().or(z.literal("")),
    previousSchool: z.string().trim().max(200).optional().or(z.literal("")),
    house: z.string().trim().max(120).optional().or(z.literal("")),
  });
}

type StudentInput = z.infer<ReturnType<typeof studentSchema>>;

function optionalString(v: string | null | undefined): string | null {
  return v ? v : null;
}

async function assertStudentNoAvailable(
  schoolId: string,
  studentNo: string,
  excludeId?: string
) {
  if (!studentNo) return true;
  const existing = await db.student.findUnique({
    where: { schoolId_studentNo: { schoolId, studentNo } },
    select: { id: true },
  });
  return !existing || existing.id === excludeId;
}

export async function createStudent(
  schoolSlug: string,
  input: FormData
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "students:manage");

  const parsed = studentSchema().safeParse({
    firstName: input.get("firstName"),
    middleName: input.get("middleName"),
    lastName: input.get("lastName"),
    gender: input.get("gender"),
    dateOfBirth: input.get("dateOfBirth") || undefined,
    studentNo: input.get("studentNo"),
    admissionDate: input.get("admissionDate") || undefined,
    status: input.get("status") || undefined,
    photoUrl: input.get("photoUrl"),
    address: input.get("address"),
    phone: input.get("phone"),
    emergencyContactName: input.get("emergencyContactName"),
    emergencyContactPhone: input.get("emergencyContactPhone"),
    emergencyContactRelation: input.get("emergencyContactRelation"),
    previousSchool: input.get("previousSchool"),
    house: input.get("house"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data as StudentInput;

  if (!(await assertStudentNoAvailable(access.schoolId, data.studentNo ?? ""))) {
    return fail("A student with this admission number already exists.", {
      studentNo: ["Admission number must be unique within the school."],
    });
  }

  const studentData = {
    schoolId: access.schoolId,
    firstName: data.firstName,
    middleName: optionalString(data.middleName),
    lastName: data.lastName,
    gender: (data.gender as Gender | null) ?? null,
    dateOfBirth: data.dateOfBirth,
    studentNo: optionalString(data.studentNo),
    admissionDate: data.admissionDate,
    status: (data.status as StudentStatus | undefined) ?? "ACTIVE",
    photoUrl: data.photoUrl ?? null,
    address: optionalString(data.address),
    phone: optionalString(data.phone),
    emergencyContactName: optionalString(data.emergencyContactName),
    emergencyContactPhone: optionalString(data.emergencyContactPhone),
    emergencyContactRelation: optionalString(data.emergencyContactRelation),
    previousSchool: optionalString(data.previousSchool),
    house: optionalString(data.house),
  };

  // Platform staff (Super Admin triaging a tenant) are never blocked by the
  // plan's usage limits; school-level users are. The count + insert run inside
  // one Serializable transaction so concurrent creates cannot bypass the cap.
  let createdId: string;
  if (access.isPlatformStaff) {
    const created = await db.student.create({ data: studentData, select: { id: true } });
    createdId = created.id;
  } else {
    try {
      createdId = await db.$transaction(
        async (tx) => {
          await assertUsageCapacityTx(tx, access.schoolId, "student");
          const created = await tx.student.create({ data: studentData, select: { id: true } });
          return created.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (err) {
      if (err instanceof UsageLimitError) return fail(err.message);
      throw err;
    }
  }

  revalidatePath(`/${schoolSlug}/students`);
  return ok({ id: createdId });
}

export async function updateStudent(
  schoolSlug: string,
  studentId: string,
  input: FormData
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "students:manage");

  const existing = await getStudentInSchool(access.schoolId, studentId);
  if (!existing) return fail("Student not found.");

  const parsed = studentSchema().safeParse({
    firstName: input.get("firstName"),
    middleName: input.get("middleName"),
    lastName: input.get("lastName"),
    gender: input.get("gender"),
    dateOfBirth: input.get("dateOfBirth") || undefined,
    studentNo: input.get("studentNo"),
    admissionDate: input.get("admissionDate") || undefined,
    status: input.get("status") || undefined,
    photoUrl: input.get("photoUrl"),
    address: input.get("address"),
    phone: input.get("phone"),
    emergencyContactName: input.get("emergencyContactName"),
    emergencyContactPhone: input.get("emergencyContactPhone"),
    emergencyContactRelation: input.get("emergencyContactRelation"),
    previousSchool: input.get("previousSchool"),
    house: input.get("house"),
  });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }
  const data = parsed.data as StudentInput;

  if (!(await assertStudentNoAvailable(access.schoolId, data.studentNo ?? "", studentId))) {
    return fail("A student with this admission number already exists.", {
      studentNo: ["Admission number must be unique within the school."],
    });
  }

  await db.student.update({
    where: { id: studentId },
    data: {
      firstName: data.firstName,
      middleName: optionalString(data.middleName),
      lastName: data.lastName,
      gender: (data.gender as Gender | null) ?? null,
      dateOfBirth: data.dateOfBirth,
      studentNo: optionalString(data.studentNo),
      admissionDate: data.admissionDate,
      status: (data.status as StudentStatus | undefined) ?? "ACTIVE",
      photoUrl: data.photoUrl ?? null,
      address: optionalString(data.address),
      phone: optionalString(data.phone),
      emergencyContactName: optionalString(data.emergencyContactName),
      emergencyContactPhone: optionalString(data.emergencyContactPhone),
      emergencyContactRelation: optionalString(data.emergencyContactRelation),
      previousSchool: optionalString(data.previousSchool),
      house: optionalString(data.house),
    },
  });

  revalidatePath(`/${schoolSlug}/students`);
  revalidatePath(`/${schoolSlug}/students/${studentId}`);
  return ok();
}

export async function archiveStudent(
  schoolSlug: string,
  studentId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "students:manage");

  const existing = await getStudentInSchool(access.schoolId, studentId);
  if (!existing) return fail("Student not found.");
  if (existing.archived) return fail("This student is already archived.");

  await db.student.update({
    where: { id: studentId },
    data: { archived: true, status: "WITHDRAWN" },
  });

  revalidatePath(`/${schoolSlug}/students`);
  revalidatePath(`/${schoolSlug}/students/${studentId}`);
  return ok();
}