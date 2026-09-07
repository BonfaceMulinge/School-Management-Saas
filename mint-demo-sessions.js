/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomBytes } = require("crypto");
const { Client } = require("pg");

const makeId = () => "cdemo_" + randomBytes(12).toString("base64url");
const generateToken = () => randomBytes(32).toString("base64url");
const hashToken = (t) => createHash("sha256").update(t).digest("hex");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const emails = [
    "superadmin@demo.local",
    "admin@demo.local",
    "teacher@demo.local",
    "student@demo.local",
    "parent@demo.local",
  ];
  const { rows } = await client.query(
    "SELECT id, email FROM \"User\" WHERE email = ANY($1)",
    [emails]
  );
  const out = [];
  for (const u of rows) {
    const token = generateToken();
    await client.query(
      'INSERT INTO "Session" (id, "tokenHash", "userId", "expiresAt") VALUES ($1, $2, $3, $4)',
      [makeId(), hashToken(token), u.id, new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)]
    );
    out.push(`${u.email}=${token}`);
  }
  console.log(out.join("\n"));
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });