import type { GradeBand } from "@/generated/prisma/client";

/** Serializable view of a grade band (Decimal fields converted to numbers). */
export type BandView = {
  id: string;
  minPercent: number;
  maxPercent: number;
  grade: string;
  points: number | null;
  remark: string;
};

/** Order bands high→low so the first match wins for any percentage. */
export function bandsToView(bands: GradeBand[]): BandView[] {
  return bands
    .slice()
    .sort((a, b) => b.minPercent.toNumber() - a.minPercent.toNumber())
    .map((b) => ({
      id: b.id,
      minPercent: b.minPercent.toNumber(),
      maxPercent: b.maxPercent.toNumber(),
      grade: b.grade,
      points: b.points === null ? null : b.points.toNumber(),
      remark: b.remark,
    }));
}

/** Find the band a percentage falls into (or null when outside all bands). */
export function gradeFor(
  bands: readonly BandView[],
  percentage: number
): BandView | null {
  for (const band of bands) {
    if (percentage >= band.minPercent && percentage <= band.maxPercent) {
      return band;
    }
  }
  return null;
}

/** A single mark row used for report computation. */
export type ResultRow = {
  studentId: string;
  name: string;
  studentNo: string | null;
  marksObtained: number;
  maxMarks: number;
  percentage: number;
  band: BandView | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Compute per-subject rows + overall exam summary for one student.
 * `maxMarks` comes from the exam's subject papers; marks with no recorded
 * paper count as missing (excluded from the percentage denominator like an
 * unsat paper).
 */
export function computeStudentExam(
  papers: ReadonlyArray<{ subjectId: string; subjectName: string; maxMarks: number }>,
  marksBySubject: ReadonlyMap<string, number>,
  bands: readonly BandView[]
): {
  rows: Array<{ subjectId: string; subjectName: string; maxMarks: number; obtained: number | null; percentage: number | null; band: BandView | null }>;
  obtained: number;
  max: number;
  satPapers: number;
  percentage: number | null;
  band: BandView | null;
} {
  let obtained = 0;
  let max = 0;
  const rows = [];
  for (const paper of papers) {
    const mark = marksBySubject.get(paper.subjectId);
    if (mark !== undefined && mark !== null) {
      obtained += mark;
      max += paper.maxMarks;
    }
    const subjectPct = mark === undefined ? null : round1((mark / paper.maxMarks) * 100);
    rows.push({
      subjectId: paper.subjectId,
      subjectName: paper.subjectName,
      maxMarks: paper.maxMarks,
      obtained: mark ?? null,
      percentage: subjectPct,
      band: subjectPct === null ? null : gradeFor(bands, subjectPct),
    });
  }
  const satPapers = papers.filter((p) => (marksBySubject.get(p.subjectId) ?? null) !== null).length;
  const percentage = satPapers > 0 && max > 0 ? round1((obtained / max) * 100) : null;
  return {
    rows,
    obtained,
    max,
    satPapers,
    percentage,
    band: percentage === null ? null : gradeFor(bands, percentage),
  };
}

/**
 * Rank every student of an exam by overall percentage. Ties share the same
 * rank (standard competition ranking). Sorted best → worst.
 */
export function addRanks<T extends { studentId: string; percentage: number | null }>(
  rows: T[]
): Array<T & { rank: number | null }> {
  const scored = rows
    .filter((r) => r.percentage !== null)
    .sort((a, b) => (b.percentage as number) - (a.percentage as number));
  let rank = 0;
  let prev: number | null = null;
  const scoredWithRank = scored.map((r) => {
    if (r.percentage !== prev) {
      rank = rank + 1;
      prev = r.percentage;
    }
    return { ...r, rank };
  });
  const byId = new Map(scoredWithRank.map((r) => [r.studentId, r.rank]));
  return rows.map((r) => ({
    ...r,
    rank: r.percentage === null ? null : (byId.get(r.studentId) ?? null),
  }));
}