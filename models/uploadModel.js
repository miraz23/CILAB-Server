const { pool } = require('../config/db');

async function createUpload(upload) {
  const result = await pool.query(
    `INSERT INTO uploads (
       id, user_id, upload_type, title, metadata, original_filename, mime_type,
       file_size, cloudinary_public_id, cloudinary_url, status, reviewed_at, reviewed_by
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11,
               CASE WHEN $11 = 'approved' THEN NOW() ELSE NULL END, $12)
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
      upload.status || 'pending',
      upload.reviewedBy || null,
    ]
  );
  return result.rows[0];
}

function authoredByEmailCondition(emailParameter = '$2') {
  return `(
    EXISTS (
      SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(u.metadata->'authors_email') = 'array'
            THEN u.metadata->'authors_email'
            ELSE '[]'::jsonb
          END
        ) AS author_email(value)
       WHERE lower(trim(author_email.value)) = lower(trim(${emailParameter}))
    )
    OR EXISTS (
      SELECT 1
        FROM jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(u.metadata->'presenter_email') = 'array'
            THEN u.metadata->'presenter_email'
            ELSE '[]'::jsonb
          END
        ) AS presenter_email(value)
       WHERE lower(trim(presenter_email.value)) = lower(trim(${emailParameter}))
    )
  )`;
}

async function findUploadsByUser(userId, email) {
  const canMatchAuthor = typeof email === 'string' && email.trim().length > 0;
  const values = canMatchAuthor ? [userId, email] : [userId];
  const ownershipCondition = canMatchAuthor
    ? `(u.user_id = $1 OR ${authoredByEmailCondition()})`
    : 'u.user_id = $1';

  const result = await pool.query(
    `SELECT id, upload_type, title, metadata, original_filename, mime_type,
            file_size, cloudinary_public_id, cloudinary_url, status, created_at,
            review_note,
            user_id = $1 AS is_owner
       FROM uploads u
      WHERE ${ownershipCondition}
      ORDER BY created_at DESC`,
    values
  );
  return result.rows;
}

async function updateUploadByUser(id, userId, email, title, metadata, file = null, isAdmin = false, reviewerId = null) {
  const canMatchAuthor = typeof email === 'string' && email.trim().length > 0;
  const ownershipCondition = canMatchAuthor
    ? `(u.user_id = $9 OR ${authoredByEmailCondition('$10')})`
    : 'u.user_id = $9';
  const values = [
    title,
    JSON.stringify(metadata),
    file?.originalFilename || null,
    file?.mimeType || null,
    file?.fileSize || null,
    file?.publicId || null,
    file?.url || null,
    id,
    userId,
  ];
  values.push(canMatchAuthor ? email : null, isAdmin, reviewerId);

  const result = await pool.query(
    `UPDATE uploads AS u
        SET title = $1,
            metadata = CASE
              WHEN $2::jsonb ? 'is_featured' THEN $2::jsonb
              ELSE jsonb_set(
                $2::jsonb,
                '{is_featured}',
                COALESCE(u.metadata->'is_featured', 'false'::jsonb),
                true
              )
            END,
            original_filename = COALESCE($3, u.original_filename),
            mime_type = COALESCE($4, u.mime_type),
            file_size = COALESCE($5, u.file_size),
            cloudinary_public_id = COALESCE($6, u.cloudinary_public_id),
            cloudinary_url = COALESCE($7, u.cloudinary_url),
            status = CASE WHEN $11 THEN 'approved' ELSE 'pending' END,
            review_note = NULL,
            reviewed_at = CASE WHEN $11 THEN NOW() ELSE NULL END,
            reviewed_by = CASE WHEN $11 THEN $12 ELSE NULL END
      WHERE u.id = $8 AND ${ownershipCondition}
      RETURNING id, upload_type, title, metadata, original_filename, mime_type,
          file_size, cloudinary_public_id, cloudinary_url, status, review_note, created_at`,
    values
  );
  return result.rows[0];
}

async function deleteUploadByUser(id, userId, email) {
  const canMatchAuthor = typeof email === 'string' && email.trim().length > 0;
  const ownershipCondition = canMatchAuthor
    ? `(u.user_id = $2 OR ${authoredByEmailCondition('$3')})`
    : 'u.user_id = $2';
  const values = canMatchAuthor ? [id, userId, email] : [id, userId];

  const result = await pool.query(
    `DELETE FROM uploads AS u
      WHERE u.id = $1 AND ${ownershipCondition}
      RETURNING id, cloudinary_public_id, upload_type`,
    values
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

async function getUploadStatsByUser(userId, email) {
  const canMatchAuthor = typeof email === 'string' && email.trim().length > 0;
  const values = canMatchAuthor ? [userId, email] : [userId];
  const ownershipCondition = canMatchAuthor
    ? `(u.user_id = $1 OR ${authoredByEmailCondition()})`
    : 'u.user_id = $1';

  const result = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE u.upload_type = 'paper')::int AS papers,
       COUNT(*) FILTER (WHERE u.upload_type = 'presentation')::int AS presentations,
       COUNT(*) FILTER (WHERE u.status = 'pending')::int AS pending,
       COUNT(*) FILTER (WHERE u.status = 'approved')::int AS approved,
       COUNT(*) FILTER (WHERE u.status = 'rejected')::int AS rejected
       FROM uploads u
      WHERE ${ownershipCondition}`,
    values
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

async function updateUploadModeration(id, status, note, reviewerId, featured) {
  const result = await pool.query(
    `UPDATE uploads
        SET status = $1,
            review_note = $2,
            metadata = CASE
              WHEN $5::boolean IS NULL THEN metadata
              ELSE jsonb_set(COALESCE(metadata, '{}'::jsonb), '{is_featured}', to_jsonb($5::boolean), true)
            END,
            reviewed_at = NOW(),
            reviewed_by = $3
      WHERE id = $4
      RETURNING id, status, review_note, reviewed_at`,
    [status, note || null, reviewerId, id, featured ?? null]
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
