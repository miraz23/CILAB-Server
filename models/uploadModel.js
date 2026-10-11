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

module.exports = { createUpload, findUploadsByUser, getUploadStatsByUser };
