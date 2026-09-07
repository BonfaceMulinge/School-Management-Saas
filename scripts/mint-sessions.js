/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomBytes } = require("crypto");
const { Client } = require("pg");

function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}
function hashSessionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function makeId() {
  return "citest_" + randomBytes(12).toString("base64url");
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows: users } = await client.query(
    "SELECT id, email FROM \"User\" WHERE email IN ($1,$2,$3)",
    ["itest.superadmin@example.com", "itest.admina@example.com", "itest.teacher@example.com"]
  );
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u.id]));

  let none = await client.query('SELECT id FROM "User" WHERE email = $1', ["itest.none@example.com"]);
  if (none.rowCount === 0) {
    none = await client.query(
      'INSERT INTO "User" (id, email, name, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $4) RETURNING id',
      [makeId(), "itest.none@example.com", "itest No Tenancy", new Date()]
    );
  }
  const noneId = none.rows[0].id;

  const targets = [
    ["superadmin", byEmail["itest.superadmin@example.com"]],
    ["admina", byEmail["itest.admina@example.com"]],
    ["teacher", byEmail["itest.teacher@example.com"]],
    ["none", noneId],
  ];

  const out = [];
  for (const [label, userId] of targets) {
    const token = generateSessionToken();
    await client.query(
      'INSERT INTO "Session" (id, "tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3, $4)',
      [makeId(), hashSessionToken(token), userId, new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)]
    );
    out.push(`${label}=${token}\t${userId}`);
  }

  console.log(out.join("\n"));
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});