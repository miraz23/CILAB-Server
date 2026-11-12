const { pool } = require('../config/db');

async function findLatestRequestByUserId(userId) {
  const result = await pool.query(
    `SELECT id, user_id, status, created_at, decided_at
       FROM member_requests
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

async function createMemberRequest(id, userId) {
  const result = await pool.query(
    `INSERT INTO member_requests (id, user_id)
     VALUES ($1, $2)
     RETURNING id, user_id, status, created_at, decided_at`,
    [id, userId]
  );
  return result.rows[0];
}

async function findPendingMemberRequests() {
  const result = await pool.query(
    `SELECT mr.id, mr.user_id, mr.status, mr.created_at, mr.decided_at,
            u.name, u.email, u.scholar_id, u.institution, u.role, u.app_role
       FROM member_requests mr
       JOIN users u ON u.id = mr.user_id
      WHERE mr.status = 'pending'
      ORDER BY mr.created_at ASC`
  );
  return result.rows;
}

async function decideMemberRequest(id, status) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requestResult = await client.query(
      `UPDATE member_requests
          SET status = $1, decided_at = NOW()
        WHERE id = $2 AND status = 'pending'
        RETURNING id, user_id, status, created_at, decided_at`,
      [status, id]
    );
    const request = requestResult.rows[0];
    if (!request) {
      await client.query('ROLLBACK');
      return null;
    }

    if (status === 'approved') {
      await client.query(
        `UPDATE users SET app_role = 'MEMBER' WHERE id = $1 AND app_role = 'USER'`,
        [request.user_id]
      );
    }
    await client.query('COMMIT');
    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  findLatestRequestByUserId,
  createMemberRequest,
  findPendingMemberRequests,
  decideMemberRequest,
};
