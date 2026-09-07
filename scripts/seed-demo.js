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
    await client.query(`DELETE FROM "AuditLog" WHERE "schoolId" IN (${p})`, schoolIds);
    await client.query(`DELETE FROM "School" WHERE id IN (${p})`, schoolIds);
  }
  if (userIds.length) {
    const p = userIds.map((_, i) => `$${i + 1}`).join(",");
    await client.query(`DELETE FROM "AuditLog" WHERE "actorId" IN (${p})`, userIds);
    await client.query(`DELETE FROM "User" WHERE id IN (${p})`, userIds);
  }
  await client.query('DELETE FROM "SubscriptionPlan" WHERE slug = $1', ["foundation"]);

  // ---- Users ----
  const superUserId = makeId("usr");
  const adminUserId = makeId("usr");
  const teacherUserId = makeId("usr");

  const [superHash, adminHash, teacherHash] = await Promise.all([
    hash("SuperAdmin!2026", PASSWORD_ROUNDS),
    hash("Admin!2026", PASSWORD_ROUNDS),
    hash("Teacher!2026", PASSWORD_ROUNDS),
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
    'INSERT INTO "Membership" (id, "schoolId", "userId", role, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5), ($6,$2,$7,$8,$5,$5)',
    [makeId("mem"), schoolId, adminUserId, "SCHOOL_ADMIN", ts, makeId("mem"), teacherUserId, "TEACHER"]
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

  const classId = makeId("cls");
  await client.query(
    'INSERT INTO "Class" (id, "schoolId", name, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$4)',
    [classId, schoolId, "Grade 5", ts]
  );
  const subjectId = makeId("subj");
  await client.query(
    'INSERT INTO "Subject" (id, "schoolId", name, code, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$5)',
    [subjectId, schoolId, "Mathematics", "MATH", ts]
  );
  await client.query(
    'INSERT INTO "TeacherAssignment" (id, "schoolId", "teacherId", "classId", "subjectId", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6)',
    [makeId("ta"), schoolId, teacherUserId, classId, subjectId, ts]
  );

  // ---- Students ----
  const studentIds = [];
  for (const [first, last, no] of [["Amina", "Diallo", "2026-001"], ["James", "Otieno", "2026-002"], ["Sofia", "Rossi", "2026-003"]]) {
    const sid = makeId("std");
    await client.query(
      'INSERT INTO "Student" (id, "schoolId", "firstName", "lastName", "studentNo", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$6)',
      [sid, schoolId, first, last, no, ts]
    );
    await client.query(
      'INSERT INTO "Enrollment" (id, "schoolId", "studentId", "classId", "academicYearId", "termId", status, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)',
      [makeId("enr"), schoolId, sid, classId, yearId, termId, "ACTIVE", ts]
    );
    studentIds.push(sid);
  }

  console.log(
    JSON.stringify(
      { schoolId, superUserId, adminUserId, teacherUserId, planId, subId, students: studentIds.length },
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