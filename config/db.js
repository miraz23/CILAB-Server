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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_requests (
      id UUID PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requester_id TEXT,
      owner_id TEXT,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      share_link TEXT NOT NULL,
      message TEXT,
      expires_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMPTZ
    );
  `);
  // Older deployments may already have this table with a partial schema.
  // Add the columns used by the current request flow before creating indexes.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'sender_id'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN sender_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'requester_id'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN requester_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'owner_id'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN owner_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'recipient_id'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN recipient_id TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'share_link'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN share_link TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'message'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN message TEXT;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'expires_at'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN expires_at TIMESTAMPTZ;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'status'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
      END IF;
      ALTER TABLE access_requests ALTER COLUMN status SET DEFAULT 'pending';
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'created_at'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'updated_at'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'access_requests' AND column_name = 'decided_at'
      ) THEN
        ALTER TABLE access_requests ADD COLUMN decided_at TIMESTAMPTZ;
      END IF;
    END $$;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS access_requests_recipient_idx
      ON access_requests (recipient_id, created_at DESC);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS access_requests_sender_idx
      ON access_requests (sender_id, created_at DESC);
  `);
  await pool.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS review_note TEXT`);
  await pool.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS reviewed_by TEXT REFERENCES users(id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_availability (
      id UUID PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT 'Md. Khaliluzzaman',
      day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('in-person', 'online')),
      place TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (end_time > start_time)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS schedule_availability_active_idx
      ON schedule_availability (active, day_of_week, start_time);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL CHECK (audience IN ('all', 'students', 'faculty', 'admins')),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('normal', 'important', 'urgent')),
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
      pinned BOOLEAN NOT NULL DEFAULT FALSE,
      publish_at TIMESTAMPTZ,
      author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS announcements_status_updated_idx
      ON announcements (status, updated_at DESC);
  `);

}

module.exports = { pool, initializeDb };