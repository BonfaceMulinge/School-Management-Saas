import { describe, it, expect } from "vitest";

import {
  reportCardsCsv,
  type ReportCardMeta,
  type ReportCardStudent,
} from "@/lib/report-card-csv";

const meta: ReportCardMeta = {
  schoolName: "Demo Academy",
  examName: "Term 3 End of Term Assessment",
  yearName: "2026/2027",
  termName: "Term 3",
  className: "Grade 10",
  streamName: "A",
};

function card(overrides: Partial<ReportCardStudent> = {}): ReportCardStudent {
  return {
    studentId: "stu_1",
    name: "Brian Otieno",
    studentNo: "2026-101",
    pathway: "Science, Technology, Engineering and Mathematics",
    combination: "STEM - Pure Sciences",
    obtained: 320,
    max: 400,
    percentage: 80,
    grade: "A+",
    points: 12,
    rank: 1,
    rows: [
      {
        subjectName: "Mathematics",
        maxMarks: 100,
        marksObtained: 85,
        percentage: 85,
        grade: "A",
        points: 11,
        remark: "Excellent grasp of the topic.",
      },
      {
        subjectName: "Biology",
        maxMarks: 100,
        marksObtained: 75,
        percentage: 75,
        grade: "A",
        points: 11,
        remark: null,
      },
    ],
    ...overrides,
  };
}

/** Minimal RFC4180-aware line parser so quoted commas do not shift columns. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function rows(cards: ReportCardStudent[]): { header: string[]; data: string[][] } {
  const lines = reportCardsCsv(meta, cards).split("\r\n");
  return {
    header: parseCsvLine(lines[1]),
    data: lines.slice(2).map(parseCsvLine),
  };
}

describe("reportCardsCsv", () => {
  it("writes a context line then the column header", () => {
    const lines = reportCardsCsv(meta, [card()]).split("\r\n");
    expect(lines[0]).toBe(
      "Demo Academy — Term 3 End of Term Assessment,2026/2027 · Term 3,Grade 10 · A"
    );
    expect(lines[1]).toContain("Admission No");
    expect(lines[1]).toContain("Mathematics mark");
    expect(lines[1]).toContain("Mathematics %");
    expect(lines[1].endsWith("Position")).toBe(true);
  });

  it("includes pathway and combination columns", () => {
    const lines = reportCardsCsv(meta, [card()]).split("\r\n");
    expect(lines[1]).toContain("Pathway");
    expect(lines[1]).toContain("Combination");
    expect(lines[2]).toContain("Science, Technology, Engineering and Mathematics");
    expect(lines[2]).toContain("STEM - Pure Sciences");
  });

  it("writes totals, grade, points and position", () => {
    const { header, data } = rows([card()]);
    const row = data[0];
    expect(row).toHaveLength(header.length);
    expect(row[header.indexOf("Admission No")]).toBe("2026-101");
    expect(row[header.indexOf("Student Name")]).toBe("Brian Otieno");
    expect(row[header.indexOf("Class")]).toBe("Grade 10");
    expect(row[header.indexOf("Stream")]).toBe("A");
    expect(row[header.indexOf("Total")]).toBe("320");
    expect(row[header.indexOf("Max")]).toBe("400");
    expect(row[header.indexOf("%")]).toBe("80%");
    expect(row[header.indexOf("Grade")]).toBe("A+");
    expect(row[header.indexOf("Points")]).toBe("12");
    expect(row[header.indexOf("Position")]).toBe("1");
    expect(row[header.indexOf("Mathematics mark")]).toBe("85");
    expect(row[header.indexOf("Mathematics %")]).toBe("85%");
  });

  it("aligns students that took different subjects to shared columns", () => {
    const other = card({
      studentId: "stu_2",
      name: 'Mercy "MJ" Cheruiyot',
      studentNo: "2026-102",
      rank: 2,
      rows: [
        {
          subjectName: "Mathematics",
          maxMarks: 100,
          marksObtained: 70,
          percentage: 70,
          grade: "A",
          points: 11,
          remark: null,
        },
        {
          subjectName: "History",
          maxMarks: 100,
          marksObtained: null,
          percentage: null,
          grade: null,
          points: null,
          remark: null,
        },
      ],
    });

    const { header, data } = rows([card(), other]);
    expect(header).toContain("History mark");
    const second = data[1];
    expect(second).toHaveLength(header.length);
    expect(second[header.indexOf("History mark")]).toBe("");
    expect(second[header.indexOf("History %")]).toBe("");
    expect(second[header.indexOf("Mathematics mark")]).toBe("70");
  });

  it("escapes commas and quotes in student names", () => {
    const csv = reportCardsCsv(meta, [
      card({ name: 'Kevin, Kimutai "KJ"', studentNo: null }),
    ]);
    const row = csv.split("\r\n")[2];
    expect(row).toContain('"Kevin, Kimutai ""KJ"""');
    // A null admission number stays an empty cell rather than "null".
    expect(row.startsWith(",")).toBe(true);
  });

  it("returns only the header block when there are no cards", () => {
    const lines = reportCardsCsv(meta, []).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Position");
  });
});
