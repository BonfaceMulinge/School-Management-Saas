/* eslint-disable @typescript-eslint/no-require-imports */
require("dotenv/config");

const { Client } = require("pg");

const PLAN_SLUG = "school-management-saas-version-1";
const PLAN_NAME = "School Management SaaS - Version 1";
const PLAN_PRICE_CENTS = 30000;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const admin = await client.query(
      'SELECT id FROM "User" WHERE "platformRole" = $1 ORDER BY "createdAt" ASC LIMIT 1',
      ["SUPER_ADMIN"]
    );
    if (!admin.rows[0]) throw new Error("A SUPER_ADMIN account is required before creating the Version 1 plan.");

    await client.query(
      `INSERT INTO "SubscriptionPlan"
        (id, name, slug, description, "annualPrice", "isActive", features, notes, "createdAt", "updatedAt", "createdById", "updatedById")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, true, $5::jsonb, $6, NOW(), NOW(), $7, $7)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         "annualPrice" = EXCLUDED."annualPrice",
         "isActive" = true,
         features = EXCLUDED.features,
         notes = EXCLUDED.notes,
         "updatedAt" = NOW(),
         "updatedById" = EXCLUDED."updatedById"`,
      [
        PLAN_NAME,
        PLAN_SLUG,
        "The current School Management SaaS product package.",
        PLAN_PRICE_CENTS,
        JSON.stringify({ version: 1, modules: ["students", "teachers", "academics", "exams", "results", "finance", "communication", "reports"] }),
        "Current commercial package. Future versions are not activated.",
        admin.rows[0].id,
      ]
    );

    console.log("Version 1 subscription plan is configured.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not configure Version 1 plan.");
  process.exitCode = 1;
});
