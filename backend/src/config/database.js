const { Pool } = require("pg");

let pool;

function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function getSslConfig(connectionString) {
  if (!connectionString) return false;

  // Local development may use plain TCP; cloud PostgreSQL must validate
  // the server certificate rather than silently accepting impostors.
  const hostname = new URL(connectionString).hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return false;
  }
  return { rejectUnauthorized: true };
}

function getPool() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: getSslConfig(process.env.DATABASE_URL),
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000
    });
  }

  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function checkDatabaseHealth() {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      error: "DATABASE_URL is not set"
    };
  }

  try {
    const result = await query(
      `select current_database() as database_name, current_user as role_name, now() as server_time`
    );
    const row = result.rows[0];

    return {
      ok: true,
      configured: true,
      database: row.database_name,
      role: row.role_name,
      serverTime: row.server_time
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error.message
    };
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = {
  checkDatabaseHealth,
  closePool,
  getPool,
  isDatabaseConfigured,
  query
};