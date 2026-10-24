const { pool } = require('../config/db');

const SELECT_FIELDS = `
  SELECT a.id, a.kind, a.title, a.body, a.audience, a.priority, a.status, a.pinned,
         a.publish_at, a.event_at, a.venue, a.poster, a.extra_fields,
         a.created_at, a.updated_at,
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
  if (filters.kind) add('a.kind =', filters.kind);
  if (filters.audience) add('a.audience =', filters.audience);
  if (filters.publishedNow) conditions.push('(a.publish_at IS NULL OR a.publish_at <= NOW())');
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
       (id, kind, title, body, audience, priority, status, pinned, publish_at,
        event_at, venue, poster, extra_fields, author_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      announcement.id,
      announcement.kind,
      announcement.title,
      announcement.body,
      announcement.audience,
      announcement.priority,
      announcement.status,
      announcement.pinned,
      announcement.publishAt || null,
      announcement.eventAt || null,
      announcement.venue || null,
      announcement.poster || null,
      JSON.stringify(announcement.extraFields || []),
      announcement.authorId,
    ]
  );
  return getAnnouncementById(result.rows[0].id);
}

async function updateAnnouncement(id, changes) {
  const columnMap = {
    title: 'title',
    kind: 'kind',
    body: 'body',
    audience: 'audience',
    priority: 'priority',
    status: 'status',
    pinned: 'pinned',
    publishAt: 'publish_at',
    eventAt: 'event_at',
    venue: 'venue',
    poster: 'poster',
    extraFields: 'extra_fields',
  };
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined && columnMap[key]) {
      fields.push(`${columnMap[key]} = $${values.length + 1}`);
      if (key === 'publishAt' || key === 'eventAt') values.push(value === '' ? null : value);
      else if (key === 'extraFields') values.push(JSON.stringify(value || []));
      else values.push(value);
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
