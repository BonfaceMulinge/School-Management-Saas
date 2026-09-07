/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");
const { hash } = require("bcryptjs");

const PASSWORD_ROUNDS = 12;
const now = new Date();
const ts = now.toISOString();
const ymd = (d) => d.toISOString().split("T")[0];

function makeId(label) {
  return `c${label}_${Math.random().toString(36).slice(2, 10)}${now.getTime().toString(36)}`;
}

async function seed() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ---- Idempotent cleanup of a previous demo seed ----
  const schools = await client.query('SELECT id FROM "School" WHERE slug = $1', ["demo-school"]);
  const schoolIds = schools.rows.map((r) => r.id);
  const users = await client.query('SELECT id FROM "User" WHERE email LIKE $1', ["%@demo.local"]);
  const userIds = users.rows.map((r) => r.id);

  if (schoolIds.length) {
    const p = schoolIds.map((_, i) => `$${i + 1}`).join(",");
    // Delete dependent tables first
    await client.query(`DELETE FROM "AuditLog" WHERE "schoolId" IN (${p})`, schoolIds);
    await client.query(`DELETE FROM "SchoolSubscription" WHERE "schoolId" IN (${p})`, schoolIds);
    await client.query(`DELETE FROM "SchoolSettings" WHERE "schoolId" IN (${p})`, schoolIds);
    await client.query(`DELETE FROM "SchoolOnboarding" WHERE "schoolId" IN (${p})`, schoolIds);
    await client.query(`DELETE FROM "School" WHERE id IN (${p})`, schoolIds);
  }

  // Delete subscription plans created by these users (via createdById)
  if (userIds.length) {
    const p = userIds.map((_, i) => `$${i + 1}`).join(",");
    await client.query(`DELETE FROM "SubscriptionPlan" WHERE "createdById" IN (${p})`, userIds);
  }

  // Now delete users
  if (userIds.length) {
    const p = userIds.map((_, i) => `$${i + 1}`).join(",");
    await client.query(`DELETE FROM "AuditLog" WHERE "actorId" IN (${p})`, userIds);
    await client.query(`DELETE FROM "User" WHERE id IN (${p})`, userIds);
  }

  // ---- Users ----
  const superUserId = makeId("usr");
  const adminUserId = makeId("usr");
  const teacherUserId = makeId("usr");
  const studentUserId = makeId("usr");
  const parentUserId = makeId("usr");

  const [superHash, adminHash, teacherHash, studentHash, parentHash] = await Promise.all([
    hash("SuperAdmin!2026", PASSWORD_ROUNDS),
    hash("Admin!2026", PASSWORD_ROUNDS),
    hash("Teacher!2026", PASSWORD_ROUNDS),
    hash("Student!2026", PASSWORD_ROUNDS),
    hash("Parent!2026", PASSWORD_ROUNDS),
  ]);

  await client.query(
    'INSERT INTO "User" (id, email, name, "passwordHash", "platformRole", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6)',
    [superUserId, "superadmin@demo.local", "Platform Super Admin", superHash, "SUPER_ADMIN", ts]
  );
  await client.query(
    'INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
    [adminUserId, "admin@demo.local", "Demo Admin", adminHash, ts]
  );
  await client.query(
    'INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
    [teacherUserId, "teacher@demo.local", "Demo Teacher", teacherHash, ts]
  );
  await client.query(
    'INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
    [studentUserId, "student@demo.local", "Demo Student", studentHash, ts]
  );
  await client.query(
    'INSERT INTO "User" (id, email, name, "passwordHash", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
    [parentUserId, "parent@demo.local", "Demo Parent", parentHash, ts]
  );

  // ---- Plan + School + subscription ----
  const planId = makeId("pln");
  await client.query(
    'INSERT INTO "SubscriptionPlan" (id, name, slug, "annualPrice", "isActive", "createdById", "updatedById", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,true,$5,$5,$6,$6)',
    [planId, "Foundation", "foundation", 0, superUserId, ts]
  );

  const schoolId = makeId("sch");
  await client.query(
    'INSERT INTO "School" (id, name, slug, email, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
    [schoolId, "Demo Academy", "demo-school", "academy@demo.local", ts]
  );
  await client.query(
    'INSERT INTO "SchoolSettings" (id, "schoolId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$3)',
    [makeId("set"), schoolId, ts]
  );
  await client.query(
    'INSERT INTO "SchoolOnboarding" (id, "schoolId", completed, "completedAt", "createdAt", "updatedAt") VALUES ($1,$2,true,$3,$3,$3)',
    [makeId("onb"), schoolId, ts]
  );

  const subId = makeId("sub");
  await client.query(
    'INSERT INTO "SchoolSubscription" (id, "schoolId", "planId", status, "startDate", "endDate", "createdById", "updatedById", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$8)',
    [subId, schoolId, planId, "ACTIVE", ymd(new Date(Date.now() - 30 * 86400000)), ymd(new Date(Date.now() + 330 * 86400000)), superUserId, ts]
  );

  await client.query(
    'INSERT INTO "Membership" (id, "schoolId", "userId", role, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5), ($6,$2,$7,$8,$5,$5), ($9,$2,$10,$11,$5,$5), ($12,$2,$13,$14,$5,$5)',
    [makeId("mem"), schoolId, adminUserId, "SCHOOL_ADMIN", ts, makeId("mem"), teacherUserId, "TEACHER", makeId("mem"), studentUserId, "STUDENT", makeId("mem"), parentUserId, "PARENT"]
  );

  // ---- Academics ----
  const yearId = makeId("yr");
  await client.query(
    'INSERT INTO "AcademicYear" (id, "schoolId", name, "startDate", "endDate", "isActive", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,true,$6,$6)',
    [yearId, schoolId, "2026/2027", ymd(new Date("2026-01-01")), ymd(new Date("2026-12-31")), ts]
  );
  const termId = makeId("trm");
  await client.query(
    'INSERT INTO "Term" (id, "academicYearId", name, "startDate", "endDate", "isActive", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,true,$6,$6)',
    [termId, yearId, "Term 1", ymd(new Date("2026-01-10")), ymd(new Date("2026-04-10")), ts]
  );
  const term2Id = makeId("trm2");
  await client.query(
    'INSERT INTO "Term" (id, "academicYearId", name, "startDate", "endDate", "isActive", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,true,$6,$6)',
    [term2Id, yearId, "Term 2", ymd(new Date("2026-04-20")), ymd(new Date("2026-07-20")), ts]
  );

  // Multiple classes and streams
  const classIds = [];
  const streamIds = [];
  for (const [name, streams] of [["Grade 5", ["A", "B"]], ["Grade 6", ["A"]], ["Grade 7", ["A", "B"]]]) {
    const clsId = makeId("cls");
    await client.query(
      'INSERT INTO "Class" (id, "schoolId", name, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$4)',
      [clsId, schoolId, name, ts]
    );
    classIds.push(clsId);
    for (const streamName of streams) {
      const streamId = makeId("str");
      await client.query(
        'INSERT INTO "Stream" (id, "classId", name, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$4)',
        [streamId, clsId, streamName, ts]
      );
      streamIds.push({ classId: clsId, streamId, streamName });
    }
  }

  // Multiple subjects
  const subjectIds = {};
  for (const [name, code] of [
    ["Mathematics", "MATH"],
    ["English", "ENG"],
    ["Science", "SCI"],
    ["Kiswahili", "KIS"],
    ["Social Studies", "SOC"],
  ]) {
    const subId = makeId("subj");
    await client.query(
      'INSERT INTO "Subject" (id, "schoolId", name, code, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
      [subId, schoolId, name, code, ts]
    );
    subjectIds[name] = subId;
  }

  // Teacher assignments - teacher teaches Math and Science in Grade 5A and Grade 6A
  const grade5a = streamIds.find(s => s.streamName === "A" && s.classId === classIds[0]);
  const grade6a = streamIds.find(s => s.streamName === "A" && s.classId === classIds[1]);
  for (const subj of ["Mathematics", "Science"]) {
    await client.query(
      'INSERT INTO "TeacherAssignment" (id, "schoolId", "teacherId", "classId", "subjectId", "streamId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
      [makeId("ta"), schoolId, teacherUserId, grade5a.classId, subjectIds[subj], grade5a.streamId, ts]
    );
    await client.query(
      'INSERT INTO "TeacherAssignment" (id, "schoolId", "teacherId", "classId", "subjectId", "streamId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
      [makeId("ta"), schoolId, teacherUserId, grade6a.classId, subjectIds[subj], grade6a.streamId, ts]
    );
  }

  // ---- Students ----
  const students = [
    ["Amina", "Diallo", "2026-001", "FEMALE", grade5a.classId, grade5a.streamId, studentUserId, parentUserId], // linked to student@demo.local + parent@demo.local
    ["James", "Otieno", "2026-002", "MALE", grade5a.classId, grade5a.streamId, null, parentUserId], // linked to parent@demo.local
    ["Sofia", "Rossi", "2026-003", "FEMALE", grade5a.classId, grade5a.streamId, null, null],
    ["Liam", "Mwangi", "2026-004", "MALE", grade5a.classId, grade5a.streamId, null, null],
    ["Fatima", "Ali", "2026-005", "FEMALE", grade6a.classId, grade6a.streamId, null, null],
  ];

  const studentIds = [];
  for (const [first, last, no, gender, clsId, strmId, studentUserId, guardianUserId] of students) {
    const sid = makeId("std");
    await client.query(
      'INSERT INTO "Student" (id, "schoolId", "firstName", "lastName", "studentNo", gender, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
      [sid, schoolId, first, last, no, gender, ts]
    );
    await client.query(
      'INSERT INTO "Enrollment" (id, "schoolId", "studentId", "classId", "streamId", "academicYearId", "termId", status, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
      [makeId("enr"), schoolId, sid, clsId, strmId, yearId, termId, "ACTIVE", ts]
    );
    studentIds.push(sid);
    if (guardianUserId) {
      await client.query(
        'INSERT INTO "Guardian" (id, "schoolId", "studentId", "guardianUserId", relationship, "isPrimary", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
        [makeId("grd"), schoolId, sid, guardianUserId, "Parent", true, ts]
      );
    }
  }

  // Link the first student (Amina) to the student user
  await client.query(
    'INSERT INTO "Guardian" (id, "schoolId", "studentId", "guardianUserId", relationship, "isPrimary", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)',
    [makeId("grd"), schoolId, studentIds[0], studentUserId, "Self", true, ts]
  );

  console.log(
    JSON.stringify(
      { schoolId, superUserId, adminUserId, teacherUserId, studentUserId, parentUserId, planId, subId, students: studentIds.length },
      null,
      2
    )
  );
  console.log("Seeded demo tenant OK.");

  await client.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});