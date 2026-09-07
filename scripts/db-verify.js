/* eslint-disable @typescript-eslint/no-require-imports */
const { Client } = require("pg");

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name;
  `);

  const enums = await client.query(`
    SELECT t.typname AS enum_name, e.enumlabel AS label
    FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    ORDER BY t.typname, e.enumsortorder;
  `);

  const indexes = await client.query(`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname;
  `);

  const foreignKeys = await client.query(`
    SELECT tc.table_name, tc.constraint_name, kcu.column_name,
           ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `);

  const constraints = await client.query(`
    SELECT tc.table_name, tc.constraint_type, tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public' AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE','CHECK')
    ORDER BY tc.table_name, tc.constraint_type;
  `);

  const stats = {
    tables: tables.rows.map((r) => r.table_name),
    enumCount: new Set(enums.rows.map((r) => r.enum_name)).size,
    indexCount: indexes.rows.length,
    fkCount: foreignKeys.rows.length,
    constraintCount: constraints.rows.length,
  };

  console.log("=== SUMMARY ===");
  console.log(JSON.stringify(stats, null, 2));

  console.log("\n=== TABLES ===");
  console.log(stats.tables.join("\n"));

  console.log("\n=== ENUMS (name -> labels) ===");
  const byEnum = {};
  for (const r of enums.rows) {
    (byEnum[r.enum_name] = byEnum[r.enum_name] || []).push(r.label);
  }
  for (const [n, labels] of Object.entries(byEnum)) {
    console.log(`${n} => ${labels.join(", ")}`);
  }

  console.log("\n=== MONETARY DECIMAL COLUMNS ===");
  const decimals = await client.query(`
    SELECT table_name, column_name, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'numeric' AND numeric_scale = 2
    ORDER BY table_name, column_name;
  `);
  for (const r of decimals.rows) {
    console.log(`${r.table_name}.${r.column_name} numeric(${r.numeric_precision},${r.numeric_scale})`);
  }

  console.log("\n=== FK COUNT BY TABLE ===");
  const fkByTable = {};
  for (const r of foreignKeys.rows) {
    (fkByTable[r.table_name] = fkByTable[r.table_name] || []).push(`${r.column_name}->${r.referenced_table}`);
  }
  for (const [t, fks] of Object.entries(fkByTable)) {
    console.log(`${t}: ${fks.join(", ")}`);
  }

  console.log("\n=== INDEXES WITH NO schoolId PREFIX (potential global-scope) ===");
  for (const r of indexes.rows) {
    const idxDef = (await client.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = $1 AND schemaname='public'`,
      [r.indexname]
    )).rows[0]?.indexdef || "";
    if (!idxDef.includes("schoolId")) {
      console.log(`${r.tablename}.${r.indexname}`);
    }
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});