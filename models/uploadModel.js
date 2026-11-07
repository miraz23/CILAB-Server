const { pool } = require('../config/db');

async function createUpload(upload) {
  const result = await pool.query(
    `INSERT INTO uploads (
       id, user_id, upload_type, title, metadata, original_filename, mime_type,
       file_size, cloudinary_public_id, cloudinary_url
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
     RETURNING id, upload_type, title, metadata, original_filename, mime_type,
               file_size, cloudinary_public_id, cloudinary_url, status, created_at`,
    [
      upload.id,
      upload.userId,
      upload.type,
      upload.title,
      JSON.stringify(upload.metadata),
      upload.originalFilename,
      upload.mimeType,
      upload.fileSize,
      upload.publicId,
      upload.url,
    ]
  );
  return result.rows[0];
}

async function findUploadsByUser(userId) {
  const result = await pool.query(
    `SELECT id, upload_type, title, metadata, original_filename, mime_type,
            file_size, cloudinary_public_id, cloudinary_url, status, created_at
       FROM uploads
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function updateUploadByUser(id, userId, title, metadata) {
  const result = await pool.query(
    `UPDATE uploads
        SET title = $1,
            metadata = $2::jsonb,
            status = 'pending',
            review_note = NULL,
            reviewed_at = NULL,
            reviewed_by = NULL
      WHERE id = $3 AND user_id = $4
      RETURNING id, upload_type, title, metadata, original_filename, mime_type,
                file_size, cloudinary_url, status, created_at`,
    [title, JSON.stringify(metadata), id, userId]
  );
  return result.rows[0];
}

async function deleteUploadByUser(id, userId) {
  const result = await pool.query(
    `DELETE FROM uploads
      WHERE id = $1 AND user_id = $2
      RETURNING id, cloudinary_public_id, upload_type`,
    [id, userId]
  );
  return result.rows[0];
}

async function findPublishedUploads() {
  const result = await pool.query(
    `SELECT u.id, u.upload_type, u.title, u.metadata, u.cloudinary_url,
            u.file_size, u.created_at, usr.name AS author_name
       FROM uploads u
       JOIN users usr ON usr.id = u.user_id
      WHERE u.status = 'approved'
      ORDER BY u.created_at DESC`
  );
  return result.rows;
}

async function searchPublishedUploads(search) {
  const tokens = search.trim().split(/\s+/).filter(Boolean);
  const values = tokens.map((token) => `%${token}%`);
  const conditions = tokens.map((_, index) => {
    const value = `$${index + 1}`;
    return `(
      u.title ILIKE ${value}
      OR COALESCE(usr.name, '') ILIKE ${value}
      OR COALESCE(u.original_filename, '') ILIKE ${value}
      OR COALESCE(u.metadata->>'paper_title', '') ILIKE ${value}
      OR COALESCE(u.metadata->>'paper_category', '') ILIKE ${value}
      OR COALESCE(u.metadata->>'paper_tags', '') ILIKE ${value}
      OR COALESCE(u.metadata->>'paper_abstract', '') ILIKE ${value}
      OR COALESCE(u.metadata->>'presentation_category', '') ILIKE ${value}
      OR COALESCE(u.metadata->>'presentation_event', '') ILIKE ${value}
      OR COALESCE(u.metadata->>'event_name', '') ILIKE ${value}
      OR COALESCE(u.metadata->>'presentation_tags', '') ILIKE ${value}
      OR COALESCE(u.metadata->>'paper_url', '') ILIKE ${value}
    )`;
  });

  const result = await pool.query(
    `SELECT u.id, u.upload_type, u.title, u.metadata, u.cloudinary_url,
            u.file_size, u.created_at, usr.name AS author_name
       FROM uploads u
       JOIN users usr ON usr.id = u.user_id
      WHERE u.status = 'approved'
        AND ${conditions.join(' AND ')}
      ORDER BY u.created_at DESC`,
    values
  );
  return result.rows;
}

async function findPublishedUploadById(id) {
  const result = await pool.query(
    `SELECT id, original_filename, mime_type, cloudinary_public_id
       FROM uploads
      WHERE id = $1 AND status = 'approved'`,
    [id]
  );
  return result.rows[0];
}

async function getUploadStatsByUser(userId) {
  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE upload_type = 'paper')::int AS papers,
       COUNT(*) FILTER (WHERE upload_type = 'presentation')::int AS presentations,
       COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
       COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
       FROM uploads
      WHERE user_id = $1`,
    [userId]
  );
  return { ...result.rows[0], totalDownloads: 0 };
}

async function findModerationUploads(filters = {}) {
  const values = [];
  const conditions = [];

  if (filters.contentType && ['paper', 'presentation'].includes(filters.contentType)) {
    values.push(filters.contentType);
    conditions.push(`u.upload_type = $${values.length}`);
  }
  if (filters.status && ['pending', 'approved', 'rejected'].includes(filters.status)) {
    values.push(filters.status);
    conditions.push(`u.status = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(
      u.title ILIKE $${values.length}
      OR COALESCE(u.metadata->>'paper_category', '') ILIKE $${values.length}
      OR COALESCE(u.metadata->>'presentation_event', '') ILIKE $${values.length}
      OR COALESCE(u.metadata->>'event_name', '') ILIKE $${values.length}
      OR usr.name ILIKE $${values.length}
    )`);
  }

  const result = await pool.query(
    `SELECT u.id, u.upload_type, u.title, u.metadata, u.original_filename,
            u.mime_type, u.cloudinary_url, u.file_size, u.status, u.created_at,
            u.review_note, u.reviewed_at,
            usr.id AS author_id, usr.name AS author_name,
            usr.role AS author_role, usr.institution AS author_institution
       FROM uploads u
       JOIN users usr ON usr.id = u.user_id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY u.created_at DESC`,
    values
  );
  return result.rows;
}

async function findModerationUploadById(id) {
  const result = await pool.query(
    `SELECT id, upload_type, original_filename, mime_type, cloudinary_public_id
       FROM uploads
      WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

async function updateUploadModeration(id, status, note, reviewerId) {
  const result = await pool.query(
    `UPDATE uploads
        SET status = $1, review_note = $2, reviewed_at = NOW(), reviewed_by = $3
      WHERE id = $4
      RETURNING id, status, review_note, reviewed_at`,
    [status, note || null, reviewerId, id]
  );
  return result.rows[0];
}

module.exports = {
  createUpload,
  findUploadsByUser,
  updateUploadByUser,
  deleteUploadByUser,
  findPublishedUploads,
  searchPublishedUploads,
  findPublishedUploadById,
  getUploadStatsByUser,
  findModerationUploads,
  findModerationUploadById,
  updateUploadModeration,
};
