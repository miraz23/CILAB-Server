const { pool } = require('../config/db');

async function getPublicStats() {
  const result = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE upload_type = 'paper')::int AS papers,
      COUNT(*) FILTER (WHERE upload_type = 'presentation')::int AS presentations
    FROM uploads
    WHERE status = 'approved'
  `);
  const memberResult = await pool.query(`
    SELECT COUNT(*)::int AS researchers
    FROM users
    WHERE status = 'active'
  `);

  return {
    papers: result.rows[0].papers,
    presentations: result.rows[0].presentations,
    researchers: memberResult.rows[0].researchers,
  };
}

module.exports = { getPublicStats };
