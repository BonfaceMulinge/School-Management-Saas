/** Serialisable subject row used by report cards and their CSV export. */
export type ReportCardSubjectRow = {
  subjectName: string;
  maxMarks: number;
  marksObtained: number | null;
  percentage: number | null;
  grade: string | null;
  points: number | null;
  remark: string | null;
};

export type ReportCardStudent = {
  studentId: string;
  name: string;
  studentNo: string | null;
  pathway: string | null;
  combination: string | null;
  obtained: number;
  max: number;
  percentage: number | null;
  grade: string | null;
  points: number | null;
  rank: number | null;
  rows: ReportCardSubjectRow[];
};

export type ReportCardMeta = {
  schoolName: string;
  examName: string;
  yearName: string;
  termName: string;
  className: string;
  streamName: string | null;
};

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const pct = (value: number | null) => (value === null ? null : `${value}%`);

/**
 * One row per student, one pair of columns per subject (mark and %), plus the
 * overall totals and rank. Columns are derived from the first card so every
 * student lines up with the same subject columns.
 */
export function reportCardsCsv(
  meta: ReportCardMeta,
  cards: ReportCardStudent[]
): string {
  const subjects: string[] = [];
  for (const card of cards) {
    for (const row of card.rows) {
      if (!subjects.includes(row.subjectName)) subjects.push(row.subjectName);
    }
  }

  const header = [
    "Admission No",
    "Student Name",
    "Class",
    "Stream",
    "Pathway",
    "Combination",
    ...subjects.flatMap((s) => [`${s} mark`, `${s} %`]),
    "Total",
    "Max",
    "%",
    "Grade",
    "Points",
    "Position",
  ];

  const lines = [
    [
      cell(`${meta.schoolName} — ${meta.examName}`),
      cell(`${meta.yearName} · ${meta.termName}`),
      cell(`${meta.className}${meta.streamName ? ` · ${meta.streamName}` : ""}`),
    ]
      .join(","),
    header.map(cell).join(","),
  ];

  for (const card of cards) {
    const bySubject = new Map(card.rows.map((r) => [r.subjectName, r]));
    lines.push(
      [
        card.studentNo,
        card.name,
        meta.className,
        meta.streamName,
        card.pathway,
        card.combination,
        ...subjects.flatMap((name) => {
          const row = bySubject.get(name);
          return [row?.marksObtained ?? "", pct(row?.percentage ?? null)];
        }),
        card.max > 0 ? card.obtained : "",
        card.max > 0 ? card.max : "",
        pct(card.percentage),
        card.grade,
        card.points,
        card.rank,
      ]
        .map(cell)
        .join(",")
    );
  }

  return lines.join("\r\n");
}