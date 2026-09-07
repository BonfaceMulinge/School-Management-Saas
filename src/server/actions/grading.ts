"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/server/db";
import { assertPermission } from "@/server/authorization";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { Prisma } from "@/generated/prisma/client";

function indexedEntries(
  input: FormData,
  prefix: string
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of input.entries()) {
    if (!key.startsWith(`${prefix}[`)) continue;
    const id = key.slice(prefix.length + 1, -1);
    if (id) map.set(id, String(value));
  }
  return map;
}

const percentPattern = /^\d{1,3}(\.\d{1,2})?$/;
const pointsPattern = /^\d{1,2}(\.\d{1,2})?$/;

type BandInput = {
  key: string;
  minPercent: Prisma.Decimal;
  maxPercent: Prisma.Decimal;
  grade: string;
  points: Prisma.Decimal | null;
  remark: string;
};

async function parseBands(
  input: FormData
): Promise<{ ok: true; bands: BandInput[] } | { ok: false; error: string }> {
  const minMap = indexedEntries(input, "min");
  const maxMap = indexedEntries(input, "max");
  const gradeMap = indexedEntries(input, "grade");
  const pointsMap = indexedEntries(input, "points");
  const remarkMap = indexedEntries(input, "remark");

  const bands: BandInput[] = [];
  for (const [key, rawMin] of minMap) {
    const rawMax = (maxMap.get(key) ?? "").trim();
    const grade = (gradeMap.get(key) ?? "").trim();
    const rawPoints = (pointsMap.get(key) ?? "").trim();
    const remark = (remarkMap.get(key) ?? "").trim();

    if (!percentPattern.test(rawMin.trim()) || !percentPattern.test(rawMax)) {
      return { ok: false, error: "Each band needs valid minimum and maximum percentages." };
    }
    if (!grade) {
      return { ok: false, error: "Each band needs a grade label." };
    }

    const minPercent = new Prisma.Decimal(rawMin.trim());
    const maxPercent = new Prisma.Decimal(rawMax);
    if (minPercent.isNegative() || maxPercent.gt(100)) {
      return { ok: false, error: "Percentages must be between 0 and 100." };
    }
    if (minPercent.gte(maxPercent)) {
      return { ok: false, error: "Each band's minimum must be lower than its maximum." };
    }

    let points: Prisma.Decimal | null = null;
    if (rawPoints && pointsPattern.test(rawPoints)) {
      points = new Prisma.Decimal(rawPoints);
    }

    bands.push({ key, minPercent, maxPercent, grade, points, remark });
  }

  if (bands.length === 0) {
    return { ok: false, error: "Add at least one grade band." };
  }

  // Bands must not overlap; sort ascending and check for collisions.
  const sorted = bands.slice().sort((a, b) => a.minPercent.cmp(b.minPercent));
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.minPercent.lt(prev.maxPercent)) {
      return {
        ok: false,
        error: `Grade bands overlap: “${prev.grade}” (${prev.minPercent}–${prev.maxPercent}) and “${curr.grade}” (${curr.minPercent}–${curr.maxPercent}).`,
      };
    }
  }

  return { ok: true, bands };
}

function revalidatePaths(slug: string) {
  revalidatePath(`/${slug}/grading`);
}

export async function upsertGradeScale(
  schoolSlug: string,
  input: FormData,
  scaleId?: string
): Promise<ActionResult<{ id: string }>> {
  const access = await assertPermission(schoolSlug, "grading:manage");

  const parsed = z
    .object({
      name: z.string().trim().min(1, "Name is required.").max(120),
      isDefault: z.boolean(),
    })
    .safeParse({
      name: input.get("name") ?? "",
      isDefault: input.get("isDefault") === "true",
    });
  if (!parsed.success) {
    return fail("Check the highlighted fields.", parsed.error.flatten().fieldErrors);
  }

  if (scaleId) {
    const existing = await db.gradeScale.findUnique({
      where: { id: scaleId, schoolId: access.schoolId },
    });
    if (!existing) return fail("Scale not found.");
  } else {
    const conflict = await db.gradeScale.findUnique({
      where: { schoolId_name: { schoolId: access.schoolId, name: parsed.data.name } },
    });
    if (conflict) {
      return fail("A scale with this name already exists.", {
        name: ["Name must be unique within the school."],
      });
    }
  }

  const bands = await parseBands(input);
  if (!bands.ok) return fail(bands.error);

  // First scale in the school automatically becomes the default.
  const scaleCount = await db.gradeScale.count({
    where: { schoolId: access.schoolId },
  });
  const wantDefault = parsed.data.isDefault || scaleCount === 0;

  const id = await db.$transaction(async (tx) => {
    if (wantDefault) {
      await tx.gradeScale.updateMany({
        where: { schoolId: access.schoolId },
        data: { isDefault: false },
      });
    }

    let scaleIdResult: string;
    if (scaleId) {
      await tx.gradeScale.update({
        where: { id: scaleId },
        data: { name: parsed.data.name, isDefault: wantDefault },
      });
      scaleIdResult = scaleId;
    } else {
      const created = await tx.gradeScale.create({
        data: { schoolId: access.schoolId, name: parsed.data.name, isDefault: wantDefault },
        select: { id: true },
      });
      scaleIdResult = created.id;
    }

    // Replace all bands for the scale with the submitted set.
    await tx.gradeBand.deleteMany({ where: { scaleId: scaleIdResult } });
    for (let i = 0; i < bands.bands.length; i += 1) {
      const b = bands.bands[i];
      await tx.gradeBand.create({
        data: {
          scaleId: scaleIdResult,
          minPercent: b.minPercent,
          maxPercent: b.maxPercent,
          grade: b.grade,
          points: b.points,
          remark: b.remark,
          sortOrder: i,
        },
      });
    }

    return scaleIdResult;
  });

  revalidatePaths(schoolSlug);
  return ok({ id });
}

export async function setDefaultGradeScale(
  schoolSlug: string,
  scaleId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "grading:manage");

  const existing = await db.gradeScale.findUnique({
    where: { id: scaleId, schoolId: access.schoolId },
  });
  if (!existing) return fail("Scale not found.");

  await db.$transaction([
    db.gradeScale.updateMany({
      where: { schoolId: access.schoolId },
      data: { isDefault: false },
    }),
    db.gradeScale.update({ where: { id: scaleId }, data: { isDefault: true } }),
  ]);

  revalidatePaths(schoolSlug);
  return ok();
}

export async function deleteGradeScale(
  schoolSlug: string,
  scaleId: string
): Promise<ActionResult> {
  const access = await assertPermission(schoolSlug, "grading:manage");

  const existing = await db.gradeScale.findUnique({
    where: { id: scaleId, schoolId: access.schoolId },
  });
  if (!existing) return fail("Scale not found.");

  const inUse = await db.gradeScale.count({ where: { schoolId: access.schoolId } });
  if (inUse === 1) {
    // Keep behaviour consistent: leave at least one usable scale in place.
    return fail("A school needs at least one grading scale. Create another before removing this one.");
  }

  await db.gradeScale.delete({ where: { id: scaleId } });

  revalidatePaths(schoolSlug);
  return ok();
}