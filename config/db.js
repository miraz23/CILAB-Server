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
      app_role TEXT NOT NULL DEFAULT 'USER',
      status TEXT NOT NULL DEFAULT 'active',
      last_active_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  await pool.query(createTableQuery);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS app_role TEXT NOT NULL DEFAULT 'USER'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`);
  await pool.query(
    `UPDATE users SET app_role = 'USER' WHERE app_role IS NULL OR app_role NOT IN ('USER', 'ADMIN')`
  );
  await pool.query(
    `UPDATE users SET status = 'active' WHERE status IS NULL OR status NOT IN ('active', 'pending', 'suspended')`
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploads (
      id UUID PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      upload_type TEXT NOT NULL CHECK (upload_type IN ('paper', 'presentation')),
      title TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size BIGINT NOT NULL,
      cloudinary_public_id TEXT NOT NULL,
      cloudinary_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

}

module.exports = { pool, initializeDb };