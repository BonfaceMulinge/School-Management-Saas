/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const schools = await client.query('SELECT id FROM "School" WHERE slug LIKE $1', ["itest-%"])
    .catch(() => ({ rows: [] }));
  const schoolIds = schools.rows.map((r) => r.id);

  const users = await client.query('SELECT id FROM "User" WHERE email LIKE $1', ["itest\\.%"])
    .catch(() => ({ rows: [] }));
  const userIds = users.rows.map((r) => r.id);

  if (schoolIds.length) {
    const placeholders = schoolIds.map((_, i) => `$${i + 1}`).join(",");
    await client.query(
      `DELETE FROM "PaymentTransaction" WHERE "schoolId" IN (${placeholders})`,
      schoolIds
    );
    await client.query(
      `DELETE FROM "OutboundMessage" WHERE "schoolId" IN (${placeholders})`,
      schoolIds
    );
    await client.query(
      `DELETE FROM "ExamMark" WHERE "schoolId" IN (${placeholders})`,
      schoolIds
    );
    const exams = await client.query(
      `SELECT id FROM "Exam" WHERE "schoolId" IN (${placeholders})`,
      schoolIds
    );
    const examIds = exams.rows.map((r) => r.id);
    if (examIds.length) {
      const ep = examIds.map((_, i) => `$${i + 1}`).join(",");
      await client.query(`DELETE FROM "ExamSubject" WHERE "examId" IN (${ep})`, examIds);
    }
    await client.query(
      `DELETE FROM "TeacherAssignment" WHERE "schoolId" IN (${placeholders})`,
      schoolIds
    );
    await client.query(
      `DELETE FROM "AuditLog" WHERE "schoolId" IN (${placeholders})`,
      schoolIds
    );
    await client.query(
      `DELETE FROM "School" WHERE id IN (${placeholders})`,
      schoolIds
    );
  }

  if (userIds.length) {
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
    await client.query(`DELETE FROM "AuditLog" WHERE "actorId" IN (${placeholders})`, userIds);
  }

  await client.query('DELETE FROM "WebhookEvent" WHERE "transactionId" IS NULL AND "providerEventId" LIKE $1', ["mock_evt_%"]);
  await client.query('DELETE FROM "IntegrationConfig" WHERE channel IN ($1, $2, $3) AND "meta"::text LIKE $4', ["PAYMENT", "EMAIL", "SMS", '%test%']);

  await client.query('DELETE FROM "SubscriptionPlan" WHERE slug LIKE $1', ["itest%plan%"]);

  if (userIds.length) {
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(",");
    await client.query(`DELETE FROM "User" WHERE id IN (${placeholders})`, userIds);
  }

  const remaining = await client.query(
    'SELECT (SELECT count(*) FROM "School" WHERE slug LIKE $1) AS schools, ' +
    '(SELECT count(*) FROM "User" WHERE email LIKE $2) AS users, ' +
    '(SELECT count(*) FROM "Session" s JOIN "User" u ON u.id = s."userId" WHERE u.email LIKE $2) AS sessions, ' +
    '(SELECT count(*) FROM "SubscriptionPlan" WHERE slug LIKE $3) AS plans',
    ["itest-%", "itest.%", "itest%plan%"]
  );
  console.log(JSON.stringify(remaining.rows[0]));

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});