const { pool } = require('../config/db');

async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, name, email, password, scholar_id, institution, role FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
}

async function findUserByScholarId(scholarId) {
  const result = await pool.query(
    'SELECT id, name, email, password, scholar_id, institution, role FROM users WHERE scholar_id = $1',
    [scholarId]
  );
  return result.rows[0];
}

async function createUser(user) {
  const result = await pool.query(
    `INSERT INTO users (id, name, email, password, scholar_id, institution, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, email, scholar_id, institution, role, created_at`,
    [
      user.id,
      user.name,
      user.email,
      user.password,
      user.scholarId,
      user.institution,
      user.role,
    ]
  );

  return result.rows[0];
}

module.exports = {
  findUserByEmail,
  findUserByScholarId,
  createUser,
};