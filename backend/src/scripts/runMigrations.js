const fs = require("fs/promises");
const path = require("path");
const { getPool, closePool, isDatabaseConfigured } = require("../config/database");

const migrationsDir = path.resolve(__dirname, "../db/migrations");
const baselinePath = path.resolve(__dirname, "../db/baselines/phase5_sync_fresh.sql");
const LEGACY_MIGRATIONS = ["001_phase5_foundation.sql", "002_align_household_schema_for_sync.sql"];

function assertNonDestructive(filename, sql) {
  // Previous migration 002 drops all household tables. Never replay that
  // operation on a database containing customer records.
  if (/\b(?:drop\s+(?:table|schema)|truncate\s+(?:table\s+)?)/i.test(sql)) {
    throw new Error(`Refusing destructive migration ${filename}. Create a forward-only migration instead.`);
  }
}

async function ensureMigrationsTable() {
  const pool = getPool();
  await pool.query(`
    create table if not exists schema_migrations (
      id bigserial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getAppliedMigrations() {
  const pool = getPool();
  const result = await pool.query("select filename from schema_migrations order by filename asc");
  return new Set(result.rows.map((row) => row.filename));
}

async function applyMigration(filename) {
  const pool = getPool();
  const filePath = path.join(migrationsDir, filename);
  const sql = await fs.readFile(filePath, "utf8");
  assertNonDestructive(filename, sql);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (filename) values ($1)", [filename]);
    await client.query("commit");
    console.log(`Applied migration ${filename}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not set. Add it before running migrations.");
  }

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  if (applied.size === 0) {
    const result = await getPool().query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'schema_migrations'"
    );
    if (result.rows[0].count === 0) {
      const baseline = await fs.readFile(baselinePath, "utf8");
      assertNonDestructive(path.basename(baselinePath), baseline);
      const client = await getPool().connect();
      try {
        await client.query("begin");
        await client.query(baseline);
        for (const filename of LEGACY_MIGRATIONS) {
          await client.query("INSERT INTO schema_migrations(filename) VALUES ($1) ON CONFLICT DO NOTHING", [filename]);
          applied.add(filename);
        }
        await client.query("commit");
        console.log("Initialized empty database from forward-only baseline.");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    } else {
      throw new Error("Existing database has no recorded migrations; manual schema review required.");
    }
  }

  const pending = files.filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  for (const filename of pending) {
    await applyMigration(filename);
  }
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });