const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const poolConfig = { connectionString };

if (connectionString.includes('sslmode=require')) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

async function initializeDb() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      scholar_id TEXT NOT NULL UNIQUE,
      institution TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);
}

module.exports = { pool, initializeDb };