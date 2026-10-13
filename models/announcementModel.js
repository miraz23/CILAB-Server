const { pool } = require('../config/db');

const SELECT_FIELDS = `
  SELECT a.id, a.title, a.body, a.audience, a.priority, a.status, a.pinned,
         a.publish_at, a.created_at, a.updated_at,
         COALESCE(u.id, '') AS author_id,
         COALESCE(u.name, 'Former administrator') AS author_name
    FROM announcements a
    LEFT JOIN users u ON u.id = a.author_id
`;

async function listAnnouncements(filters = {}) {
  const values = [];
  const conditions = [];
  const add = (sql, value) => {
    values.push(value);
    conditions.push(`${sql} $${values.length}`);
  };

  if (filters.status) add('a.status =', filters.status);
  if (filters.audience) add('a.audience =', filters.audience);
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(a.title ILIKE $${values.length} OR a.body ILIKE $${values.length})`);
  }

  const result = await pool.query(
    `${SELECT_FIELDS}
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY a.pinned DESC, a.updated_at DESC`,
    values
  );
  return result.rows;
}

async function createAnnouncement(announcement) {
  const result = await pool.query(
    `INSERT INTO announcements
       (id, title, body, audience, priority, status, pinned, publish_at, author_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      announcement.id,
      announcement.title,
      announcement.body,
      announcement.audience,
      announcement.priority,
      announcement.status,
      announcement.pinned,
      announcement.publishAt || null,
      announcement.authorId,
    ]
  );
  return getAnnouncementById(result.rows[0].id);
}

async function updateAnnouncement(id, changes) {
  const columnMap = {
    title: 'title',
    body: 'body',
    audience: 'audience',
    priority: 'priority',
    status: 'status',
    pinned: 'pinned',
    publishAt: 'publish_at',
  };
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined && columnMap[key]) {
      fields.push(`${columnMap[key]} = $${values.length + 1}`);
      values.push(key === 'publishAt' && value === '' ? null : value);
    }
  }
  if (!fields.length) return null;
  fields.push('updated_at = NOW()');
  values.push(id);
  const result = await pool.query(
    `UPDATE announcements SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id`,
    values
  );
  if (!result.rows[0]) return null;
  return getAnnouncementById(result.rows[0].id);
}

async function getAnnouncementById(id) {
  const result = await pool.query(`${SELECT_FIELDS} WHERE a.id = $1`, [id]);
  return result.rows[0];
}

async function deleteAnnouncement(id) {
  const result = await pool.query(
    'DELETE FROM announcements WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rows[0];
}

module.exports = {
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
