/*
 * CBC demo seed for the demo school.
 *
 * Adds Kenya CBC structure that the live demo tenant is missing:
 *   - a full PP1 -> Grade 12 class ladder with CBC level ordering
 *   - streams, CBC subjects, senior school pathways and subject combinations
 *   - a default grading scale
 *   - senior school students enrolled with a pathway + combination
 *   - released and in-progress exams with marks and teacher remarks
 *
 * Idempotent: safe to re-run. Existing rows are updated, never duplicated.
 *
 * Usage: node scripts/seed-cbc.js
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

const SCHOOL_SLUG = "demo-school";
const YEAR_NAME = "2026/2027";
const now = new Date();
const ts = now.toISOString();
const ADMIN_EMAIL = "admin@demo.local";

let seq = 0;
function makeId(label) {
  seq += 1;
  return `ccbc_${label}_${Date.now().toString(36)}${seq.toString(36)}`;
}

/** Deterministic pseudo-random in [min, max] so re-runs keep marks stable-ish. */
function score(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

const CLASS_LADDER = [
  ["Pre-Primary 1", 0],
  ["Pre-Primary 2", 1],
  ["Grade 1", 2],
  ["Grade 2", 3],
  ["Grade 3", 4],
  ["Grade 4", 5],
  ["Grade 5", 6],
  ["Grade 6", 7],
  ["Grade 7", 8],
  ["Grade 8", 9],
  ["Grade 9", 10],
  ["Grade 10", 11],
  ["Grade 11", 12],
  ["Grade 12", 13],
];

const SUBJECTS = [
  ["Physics", "PHY", "Science"],
  ["Chemistry", "CHE", "Science"],
  ["Biology", "BIO", "Science"],
  ["Computer Studies", "CST", "Technology"],
  ["Business Studies", "BST", "Commerce"],
  ["Agriculture", "AGR", "Agriculture"],
  ["History", "HIS", "Humanities"],
  ["Geography", "GEO", "Humanities"],
  ["Christian Religious Education", "CRE", "Humanities"],
  ["Literature", "LIT", "Humanities"],
  ["Visual Arts", "VAS", "Arts"],
  ["Performing Arts", "PAS", "Arts"],
  ["Physical Education", "PED", "Sports"],
  ["Home Science", "HSC", "Home Science"],
  ["Creche", "CCH", "Pre-Primary"],
  ["Home-Based Care", "HBC", "Home Science"],
];

const PATHWAYS = [
  [
    "Science, Technology, Engineering and Mathematics",
    "STEM",
    "Pure and applied sciences with a strong mathematical foundation.",
  ],
  [
    "Arts and Sports Science",
    "ASS",
    "Arts, creative and performance subjects plus physical education.",
  ],
  [
    "Social Sciences",
    "SOC",
    "History, geography, religious education and social studies.",
  ],
  [
    "Business and Entrepreneurial Studies",
    "BES",
    "Business, commerce, technology and entrepreneurial skills.",
  ],
];

const COMBINATIONS = [
  {
    name: "STEM - Pure Sciences",
    code: "STEM-PURE",
    pathwayCode: "STEM",
    description: "Mathematics, Physics, Chemistry and Biology.",
    subjects: ["MATH", "PHY", "CHE", "BIO", "ENG", "KIS"],
  },
  {
    name: "STEM - Applied Sciences",
    code: "STEM-APP",
    pathwayCode: "STEM",
    description: "Mathematics, Biology, Chemistry and Computer Studies.",
    subjects: ["MATH", "BIO", "CHE", "CST", "ENG", "KIS"],
  },
  {
    name: "Arts and Sports Science",
    code: "ASS",
    pathwayCode: "ASS",
    description: "Literature and Kiswahili with arts and sports subjects.",
    subjects: ["LIT", "KIS", "PAS", "VAS", "PED", "ENG"],
  },
  {
    name: "Social Sciences",
    code: "SOC",
    pathwayCode: "SOC",
    description: "History, Geography and Christian Religious Education.",
    subjects: ["HIS", "GEO", "CRE", "MATH", "ENG", "KIS"],
  },
  {
    name: "Business and Entrepreneurial Studies",
    code: "BES",
    pathwayCode: "BES",
    description: "Business Studies with Mathematics and Computer Studies.",
    subjects: ["BST", "MATH", "CST", "ENG", "KIS", "AGR"],
  },
];

const GRADE_BANDS = [
  [80, 100, "A+", 12, "Excellent"],
  [70, 79.99, "A", 11, "Excellent"],
  [60, 69.99, "A-", 10, "Very Good"],
  [55, 59.99, "B+", 9, "Very Good"],
  [50, 54.99, "B", 8, "Good"],
  [45, 49.99, "B-", 7, "Good"],
  [40, 44.99, "C+", 6, "Satisfactory"],
  [35, 39.99, "C", 5, "Satisfactory"],
  [30, 34.99, "C-", 4, "Fair"],
  [25, 29.99, "D+", 3, "Fair"],
  [20, 24.99, "D", 2, "Needs Improvement"],
  [0, 19.99, "E", 1, "Poor"],
];

const SENIOR_STUDENTS = [
  ["Brian", "Otieno", "MALE", "Grade 10", "A", "STEM-PURE"],
  ["Mercy", "Cheruiyot", "FEMALE", "Grade 10", "A", "STEM-PURE"],
  ["Kevin", "Mutiso", "MALE", "Grade 10", "A", "STEM-PURE"],
  ["Esther", "Njeri", "FEMALE", "Grade 10", "A", "STEM-PURE"],
  ["Dennis", "Kariuki", "MALE", "Grade 10", "B", "SOC"],
  ["Faith", "Wanjiku", "FEMALE", "Grade 10", "B", "SOC"],
  ["Samuel", "Kimutai", "MALE", "Grade 11", "A", "STEM-APP"],
  ["Alice", "Chebet", "FEMALE", "Grade 11", "A", "STEM-APP"],
];

const REMARKS = {
  excellent: "Excellent grasp of the topic and very consistent effort.",
  good: "Good performance; keep revising past papers for speed.",
  improve: "Needs more practice on multi-step questions.",
};

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const schoolRes = await client.query(
    'SELECT id, name FROM "School" WHERE slug = $1',
    [SCHOOL_SLUG]
  );
  if (!schoolRes.rows.length) {
    throw new Error(`School "${SCHOOL_SLUG}" not found. Run scripts/seed-demo.js first.`);
  }
  const schoolId = schoolRes.rows[0].id;
  console.log(`Seeding CBC structure for ${schoolRes.rows[0].name}`);

  const adminRes = await client.query('SELECT id FROM "User" WHERE email = $1', [
    ADMIN_EMAIL,
  ]);
  if (!adminRes.rows.length) {
    throw new Error(`User "${ADMIN_EMAIL}" not found. Run scripts/seed-demo.js first.`);
  }
  const adminId = adminRes.rows[0].id;

  await client.query("BEGIN");

  // ---- Academic year + terms (exactly one active term) ---------------------
  const yearDates = { start: "2026-01-05", end: "2026-12-18" };
  let yearId;
  const yearExisting = await client.query(
    'SELECT id FROM "AcademicYear" WHERE "schoolId" = $1 AND name = $2',
    [schoolId, YEAR_NAME]
  );
  if (yearExisting.rows.length) {
    yearId = yearExisting.rows[0].id;
    await client.query(
      'UPDATE "AcademicYear" SET "startDate" = $2, "endDate" = $3, "isActive" = true, "archived" = false, "updatedAt" = $4 WHERE id = $1',
      [yearId, yearDates.start, yearDates.end, ts]
    );
  } else {
    yearId = makeId("year");
    await client.query(
      'INSERT INTO "AcademicYear" (id, "schoolId", name, "startDate", "endDate", "isActive", archived, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,true,false,$6,$6)',
      [yearId, schoolId, YEAR_NAME, yearDates.start, yearDates.end, ts]
    );
  }

  const TERM_DEFS = [
    ["Term 1", "2026-01-05", "2026-03-27"],
    ["Term 2", "2026-04-06", "2026-07-31"],
    ["Term 3", "2026-09-07", "2026-11-27"],
  ];
  const activeTerm =
    TERM_DEFS.find(([, start, end]) => {
      const t = ts.slice(0, 10);
      return t >= start && t <= end;
    }) ?? TERM_DEFS[TERM_DEFS.length - 1];

  const termIds = {};
  for (const [name, start, end] of TERM_DEFS) {
    const existing = await client.query(
      'SELECT id FROM "Term" WHERE "academicYearId" = $1 AND name = $2',
      [yearId, name]
    );
    const isActive = name === activeTerm[0];
    if (existing.rows.length) {
      termIds[name] = existing.rows[0].id;
      await client.query(
        'UPDATE "Term" SET "startDate" = $2, "endDate" = $3, "isActive" = $4, archived = false, "updatedAt" = $5 WHERE id = $1',
        [termIds[name], start, end, isActive, ts]
      );
    } else {
      termIds[name] = makeId("term");
      await client.query(
        'INSERT INTO "Term" (id, "academicYearId", name, "startDate", "endDate", "isActive", archived, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,false,$7,$7)',
        [termIds[name], yearId, name, start, end, isActive, ts]
      );
    }
  }
  // Only one term may be active per school.
  await client.query(
    'UPDATE "Term" SET "isActive" = false WHERE "academicYearId" = $1 AND name <> $2',
    [yearId, activeTerm[0]]
  );
  const termId = termIds[activeTerm[0]];
  console.log(`  year ${YEAR_NAME}, active term ${activeTerm[0]}`);

  // ---- Classes with CBC level ordering + streams ---------------------------
  const classIds = {};
  for (const [name, level] of CLASS_LADDER) {
    const existing = await client.query(
      'SELECT id FROM "Class" WHERE "schoolId" = $1 AND name = $2',
      [schoolId, name]
    );
    if (existing.rows.length) {
      classIds[name] = existing.rows[0].id;
      await client.query(
        'UPDATE "Class" SET level = $2, archived = false, "updatedAt" = $3 WHERE id = $1',
        [classIds[name], level, ts]
      );
    } else {
      classIds[name] = makeId("cls");
      await client.query(
        'INSERT INTO "Class" (id, "schoolId", name, level, archived, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,false,$5,$5)',
        [classIds[name], schoolId, name, level, ts]
      );
    }
  }

  const streamIds = {};
  for (const className of ["Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"]) {
    streamIds[className] = {};
    for (const streamName of ["A", "B"]) {
      const existing = await client.query(
        'SELECT id FROM "Stream" WHERE "classId" = $1 AND name = $2',
        [classIds[className], streamName]
      );
      if (existing.rows.length) {
        streamIds[className][streamName] = existing.rows[0].id;
      } else {
        const id = makeId("str");
        streamIds[className][streamName] = id;
        await client.query(
          'INSERT INTO "Stream" (id, "classId", name, archived, "createdAt", "updatedAt") VALUES ($1,$2,$3,false,$4,$4)',
          [id, classIds[className], streamName, ts]
        );
      }
    }
  }
  console.log(`  ${CLASS_LADDER.length} classes, streams on senior classes`);

  // ---- Subjects ------------------------------------------------------------
  const subjectIds = {};
  const existingSubjects = await client.query(
    'SELECT id, code FROM "Subject" WHERE "schoolId" = $1',
    [schoolId]
  );
  for (const row of existingSubjects.rows) subjectIds[row.code] = row.id;

  for (const [name, code, department] of SUBJECTS) {
    if (subjectIds[code]) {
      await client.query(
        'UPDATE "Subject" SET name = $2, department = $3, archived = false, "updatedAt" = $4 WHERE id = $1',
        [subjectIds[code], name, department, ts]
      );
      continue;
    }
    const id = makeId("sub");
    subjectIds[code] = id;
    await client.query(
      'INSERT INTO "Subject" (id, "schoolId", name, code, department, archived, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,false,$6,$6)',
      [id, schoolId, name, code, department, ts]
    );
  }
  console.log(`  ${SUBJECTS.length} CBC subjects ensured (${Object.keys(subjectIds).length} total)`);

  // ---- Senior school pathways ---------------------------------------------
  const pathwayIds = {};
  for (const [name, code, description] of PATHWAYS) {
    const existing = await client.query(
      'SELECT id FROM "SeniorSchoolPathway" WHERE "schoolId" = $1 AND code = $2',
      [schoolId, code]
    );
    if (existing.rows.length) {
      pathwayIds[code] = existing.rows[0].id;
      await client.query(
        'UPDATE "SeniorSchoolPathway" SET name = $2, description = $3, archived = false, "updatedAt" = $4 WHERE id = $1',
        [pathwayIds[code], name, description, ts]
      );
    } else {
      pathwayIds[code] = makeId("pth");
      await client.query(
        'INSERT INTO "SeniorSchoolPathway" (id, "schoolId", name, code, description, archived, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,false,$6,$6)',
        [pathwayIds[code], schoolId, name, code, description, ts]
      );
    }
  }
  console.log(`  ${PATHWAYS.length} senior school pathways`);

  // ---- Subject combinations + ordered subjects -----------------------------
  const combinationIds = {};
  for (const combo of COMBINATIONS) {
    let combinationId;
    const existing = await client.query(
      'SELECT id FROM "SubjectCombination" WHERE "schoolId" = $1 AND code = $2',
      [schoolId, combo.code]
    );
    if (existing.rows.length) {
      combinationId = existing.rows[0].id;
      await client.query(
        'UPDATE "SubjectCombination" SET name = $2, description = $3, "seniorSchoolPathwayId" = $4, archived = false, "updatedAt" = $5 WHERE id = $1',
        [combinationId, combo.name, combo.description, pathwayIds[combo.pathwayCode], ts]
      );
    } else {
      combinationId = makeId("cmb");
      await client.query(
        'INSERT INTO "SubjectCombination" (id, "schoolId", name, code, description, archived, "seniorSchoolPathwayId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,false,$6,$7,$7)',
        [combinationId, schoolId, combo.name, combo.code, combo.description, pathwayIds[combo.pathwayCode], ts]
      );
    }
    combinationIds[combo.code] = combinationId;

    const missing = combo.subjects.filter((code) => !subjectIds[code]);
    if (missing.length) {
      throw new Error(
        `Combination ${combo.code} references unknown subject codes: ${missing.join(", ")}`
      );
    }
    await client.query(
      'DELETE FROM "SubjectCombinationSubject" WHERE "combinationId" = $1',
      [combinationId]
    );
    for (let i = 0; i < combo.subjects.length; i += 1) {
      await client.query(
        'INSERT INTO "SubjectCombinationSubject" (id, "combinationId", "subjectId", "sortOrder", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
        [makeId("cmbs"), combinationId, subjectIds[combo.subjects[i]], i, ts]
      );
    }
  }
  console.log(`  ${COMBINATIONS.length} subject combinations with ordered subjects`);

  // ---- Default grading scale ----------------------------------------------
  let scaleId;
  const scaleExisting = await client.query(
    'SELECT id FROM "GradeScale" WHERE "schoolId" = $1 AND name = $2',
    [schoolId, "CBC Grading Scale"]
  );
  if (scaleExisting.rows.length) {
    scaleId = scaleExisting.rows[0].id;
  } else {
    scaleId = makeId("gsc");
    await client.query(
      'INSERT INTO "GradeScale" (id, "schoolId", name, "isDefault", "createdAt", "updatedAt") VALUES ($1,$2,$3,true,$4,$4)',
      [scaleId, schoolId, "CBC Grading Scale", ts]
    );
  }
  await client.query(
    'UPDATE "GradeScale" SET "isDefault" = false WHERE "schoolId" = $1 AND id <> $2',
    [schoolId, scaleId]
  );
  await client.query('DELETE FROM "GradeBand" WHERE "scaleId" = $1', [scaleId]);
  for (let i = 0; i < GRADE_BANDS.length; i += 1) {
    const [min, max, grade, points, remark] = GRADE_BANDS[i];
    await client.query(
      'INSERT INTO "GradeBand" (id, "scaleId", "minPercent", "maxPercent", grade, points, remark, "sortOrder") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [makeId("gbd"), scaleId, min, max, grade, points, remark, i]
    );
  }
  console.log(`  grading scale with ${GRADE_BANDS.length} bands`);

  // ---- Senior students with pathway + combination -------------------------
  const studentNoBase = 2026;
  const enrollmentByStudent = new Map();
  for (let i = 0; i < SENIOR_STUDENTS.length; i += 1) {
    const [firstName, lastName, gender, className, streamName, combinationCode] =
      SENIOR_STUDENTS[i];
    const studentNo = `${studentNoBase}-${101 + i}`;
    const combination = COMBINATIONS.find((c) => c.code === combinationCode);
    const pathwayId = pathwayIds[combination.pathwayCode];

    let studentId;
    const studentExisting = await client.query(
      'SELECT id FROM "Student" WHERE "schoolId" = $1 AND "studentNo" = $2',
      [schoolId, studentNo]
    );
    if (studentExisting.rows.length) {
      studentId = studentExisting.rows[0].id;
      await client.query(
        'UPDATE "Student" SET "firstName" = $2, "lastName" = $3, gender = $4, archived = false, "updatedAt" = $5 WHERE id = $1',
        [studentId, firstName, lastName, gender, ts]
      );
    } else {
      studentId = makeId("stu");
      await client.query(
        'INSERT INTO "Student" (id, "schoolId", "firstName", "lastName", gender, "studentNo", "admissionDate", status, archived, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$9)',
        [
          studentId,
          schoolId,
          firstName,
          lastName,
          gender,
          studentNo,
          `${YEAR_NAME.slice(0, 4)}-01-05`,
          "ACTIVE",
          ts,
        ]
      );
    }

    // Upsert enrollment (NULL-safe unique lookup).
    const enrollmentExisting = await client.query(
      `SELECT id FROM "Enrollment"
       WHERE "schoolId" = $1 AND "studentId" = $2 AND "classId" = $3
         AND "streamId" IS NOT DISTINCT FROM $4
         AND "academicYearId" = $5 AND "termId" IS NOT DISTINCT FROM $6`,
      [
        schoolId,
        studentId,
        classIds[className],
        streamIds[className]?.[streamName] ?? null,
        yearId,
        termId,
      ]
    );
    let enrollmentId;
    if (enrollmentExisting.rows.length) {
      enrollmentId = enrollmentExisting.rows[0].id;
      await client.query(
        'UPDATE "Enrollment" SET status = $2, "pathwayId" = $3, "combinationId" = $4, "updatedAt" = $5 WHERE id = $1',
        [enrollmentId, "ACTIVE", pathwayId, combinationIds[combinationCode], ts]
      );
    } else {
      enrollmentId = makeId("enr");
      await client.query(
        'INSERT INTO "Enrollment" (id, "schoolId", "studentId", "classId", "streamId", "pathwayId", "combinationId", "academicYearId", "termId", status, "enrolledAt", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$11)',
        [
          enrollmentId,
          schoolId,
          studentId,
          classIds[className],
          streamIds[className]?.[streamName] ?? null,
          pathwayId,
          combinationIds[combinationCode],
          yearId,
          termId,
          "ACTIVE",
          ts,
        ]
      );
    }
    enrollmentByStudent.set(studentNo, {
      studentId,
      enrollmentId,
      className,
      streamName,
      combinationCode,
    });
  }
  console.log(`  ${SENIOR_STUDENTS.length} senior students with pathway + combination`);

  // ---- Exams + marks + teacher remarks ------------------------------------
  const EXAM_DEFS = [
    {
      className: "Grade 10",
      streamName: "A",
      status: "COMPLETED",
      max: 100,
      subjects: ["MATH", "PHY", "CHE", "BIO"],
      complete: true,
    },
    {
      className: "Grade 10",
      streamName: "B",
      status: "COMPLETED",
      max: 100,
      subjects: ["HIS", "GEO", "CRE", "MATH"],
      complete: true,
    },
    {
      className: "Grade 11",
      streamName: "A",
      status: "ONGOING",
      max: 100,
      subjects: ["MATH", "BIO", "CST"],
      complete: false,
    },
  ];

  const subjectNames = await client.query(
    'SELECT id FROM "Subject" WHERE "schoolId" = $1',
    [schoolId]
  );
  if (!subjectNames.rows.length) {
    throw new Error("No subjects found for the demo school");
  }
  const subjectNameByCode = {};
  for (const [name, code] of [
    ["English", "ENG"],
    ["Kiswahili", "KIS"],
    ...SUBJECTS.map(([n, c]) => [n, c]),
  ]) {
    subjectNameByCode[code] = name;
  }

  let examCount = 0;
  let markCount = 0;
  for (const def of EXAM_DEFS) {
    const classId = classIds[def.className];
    const streamId = streamIds[def.className]?.[def.streamName] ?? null;
    const examName = `${activeTerm[0]} End of Term Assessment`;

    let examId;
    const examExisting = await client.query(
      `SELECT id FROM "Exam"
       WHERE "schoolId" = $1 AND "name" = $2 AND "classId" = $3
         AND "streamId" IS NOT DISTINCT FROM $4 AND "termId" = $5`,
      [schoolId, examName, classId, streamId, termId]
    );
    if (examExisting.rows.length) {
      examId = examExisting.rows[0].id;
      await client.query(
        'UPDATE "Exam" SET status = $2, type = $3, date = $4, "academicYearId" = $5, "updatedAt" = $6 WHERE id = $1',
        [examId, def.status, "END_TERM", activeTerm[2], yearId, ts]
      );
    } else {
      examId = makeId("exm");
      await client.query(
        'INSERT INTO "Exam" (id, "schoolId", name, type, date, "academicYearId", "termId", "classId", "streamId", status, "createdById", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)',
        [
          examId,
          schoolId,
          examName,
          "END_TERM",
          activeTerm[2],
          yearId,
          termId,
          classId,
          streamId,
          def.status,
          adminId,
          ts,
        ]
      );
    }
    examCount += 1;

    const roster = [...enrollmentByStudent.entries()].filter(
      ([, v]) => v.className === def.className && v.streamName === def.streamName
    );

    const examSubjectIds = {};
    for (let i = 0; i < def.subjects.length; i += 1) {
      const code = def.subjects[i];
      const subjectId = subjectIds[code];
      if (!subjectId) {
        throw new Error(`Exam subject code ${code} is missing for ${examName}`);
      }
      let examSubjectId;
      const examSubjectExisting = await client.query(
        'SELECT id FROM "ExamSubject" WHERE "examId" = $1 AND "subjectId" = $2',
        [examId, subjectId]
      );
      if (examSubjectExisting.rows.length) {
        examSubjectId = examSubjectExisting.rows[0].id;
        await client.query(
          'UPDATE "ExamSubject" SET "maxMarks" = $2, "sortOrder" = $3, "updatedAt" = $4 WHERE id = $1',
          [examSubjectId, def.max, i, ts]
        );
      } else {
        examSubjectId = makeId("exs");
        await client.query(
          'INSERT INTO "ExamSubject" (id, "examId", "subjectId", "maxMarks", "sortOrder", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6)',
          [examSubjectId, examId, subjectId, def.max, i, ts]
        );
      }
      examSubjectIds[code] = { id: examSubjectId, subjectId, name: subjectNameByCode[code] };
    }

    await client.query('DELETE FROM "ExamMark" WHERE "examId" = $1', [examId]);

    for (const [studentNo, value] of roster) {
      for (const code of def.subjects) {
        // Leave the first student's last subject unmarked on the in-progress
        // exam so the "results review" panel has something to catch.
        if (!def.complete && roster[0][0] === studentNo && code === def.subjects.at(-1)) {
          continue;
        }
        const percent = score(38, 92);
        const marksObtained = Math.round(percent) <= 0 ? 1 : Math.round(percent);
        const remark =
          percent >= 75
            ? REMARKS.excellent
            : percent >= 55
              ? REMARKS.good
              : REMARKS.improve;
        await client.query(
          'INSERT INTO "ExamMark" (id, "schoolId", "examId", "examSubjectId", "subjectId", "studentId", "enrollmentId", "marksObtained", remark, "recordedById", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)',
          [
            makeId("mrk"),
            schoolId,
            examId,
            examSubjectIds[code].id,
            examSubjectIds[code].subjectId,
            value.studentId,
            value.enrollmentId,
            marksObtained,
            remark,
            adminId,
            ts,
          ]
        );
        markCount += 1;
      }
    }
  }

  await client.query("COMMIT");

  console.log(`\nDone: ${examCount} exams, ${markCount} marks, ${termId ? "active term set" : ""}`);
  console.log("Sign in as admin@demo.local to review the CBC dashboards.");
  await client.end();
}

seed().catch(async (err) => {
  console.error("CBC seed failed:", err.message);
  process.exit(1);
});
