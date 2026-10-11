const { pool } = require('../config/db');

async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, name, email, password, scholar_id, institution, role, app_role, status FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
}

async function findUserByScholarId(scholarId) {
  const result = await pool.query(
    'SELECT id, name, email, password, scholar_id, institution, role, app_role, status FROM users WHERE scholar_id = $1',
    [scholarId]
  );
  return result.rows[0];
}

async function createUser(user) {
  const result = await pool.query(
    `INSERT INTO users (id, name, email, password, scholar_id, institution, role, app_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, email, scholar_id, institution, role, created_at`,
    [
      user.id,
      user.name,
      user.email,
      user.password,
      user.scholarId,
      user.institution,
      user.role,
      user.appRole || 'USER',
    ]
  );

  return result.rows[0];
}

async function findUsers(filters = {}) {
  const values = [];
  const conditions = [];
  const addCondition = (sql, value) => {
    values.push(value);
    conditions.push(`${sql} $${values.length}`);
  };

  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length} OR scholar_id ILIKE $${values.length})`);
  }
  if (filters.status && ['active', 'pending', 'suspended'].includes(filters.status)) {
    addCondition('status =', filters.status);
  }
  if (filters.appRole && ['USER', 'ADMIN'].includes(filters.appRole)) {
    addCondition('app_role =', filters.appRole);
  }
  if (filters.academicRole) {
    addCondition('role =', filters.academicRole);
  }

  let orderBy = 'created_at DESC';
  if (filters.sort === 'name') orderBy = 'name ASC';
  if (filters.sort === 'active') orderBy = 'last_active_at DESC NULLS LAST, created_at DESC';

  const result = await pool.query(
    `SELECT id, name, email, scholar_id, institution, role, app_role, status,
            created_at, last_active_at
       FROM users
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY ${orderBy}`,
    values
  );
  return result.rows;
}

async function updateUserAccess(id, changes) {
  const fields = [];
  const values = [];
  if (changes.appRole !== undefined) {
    fields.push(`app_role = $${values.length + 1}`);
    values.push(changes.appRole);
  }
  if (changes.status !== undefined) {
    fields.push(`status = $${values.length + 1}`);
    values.push(changes.status);
  }
  if (!fields.length) return null;
  values.push(id);
  const result = await pool.query(
    `UPDATE users SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, email, scholar_id, institution, role, app_role, status, created_at, last_active_at`,
    values
  );
  return result.rows[0];
}

async function getUserById(id) {
  const result = await pool.query(
    `SELECT id, name, email, scholar_id, institution, role, app_role, status, created_at, last_active_at
       FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

async function updateLastActive(id) {
  await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [id]);
}

async function updateUserProfile(id, changes) {
  const columnMap = { name: 'name', email: 'email', scholarId: 'scholar_id', institution: 'institution', role: 'role', password: 'password' };
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined && columnMap[key]) {
      fields.push(`${columnMap[key]} = $${values.length + 1}`);
      values.push(key === 'email' ? String(value).toLowerCase().trim() : String(value).trim());
    }
  }
  if (!fields.length) return null;
  values.push(id);
  const result = await pool.query(
    `UPDATE users SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING id, name, email, scholar_id, institution, role, app_role, status`,
    values
  );
  return result.rows[0];
}

module.exports = {
  findUserByEmail,
  findUserByScholarId,
  createUser,
  findUsers,
  updateUserAccess,
  getUserById,
  updateLastActive,
  updateUserProfile,
};