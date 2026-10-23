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
            file_size, cloudinary_url, status, created_at
       FROM uploads
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

async function findPublishedUploads() {
  const result = await pool.query(
    `SELECT u.id, u.upload_type, u.title, u.metadata, u.cloudinary_url,
            u.file_size, u.created_at, usr.name AS author_name
       FROM uploads u
       JOIN users usr ON usr.id = u.user_id
      ORDER BY u.created_at DESC`
  );
  return result.rows;
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
      OR COALESCE(u.metadata->>'category', '') ILIKE $${values.length}
      OR COALESCE(u.metadata->>'presentationType', '') ILIKE $${values.length}
      OR usr.name ILIKE $${values.length}
    )`);
  }

  const result = await pool.query(
    `SELECT u.id, u.upload_type, u.title, u.metadata, u.original_filename,
            u.cloudinary_url, u.file_size, u.status, u.created_at,
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
  findPublishedUploads,
  getUploadStatsByUser,
  findModerationUploads,
  updateUploadModeration,
};
