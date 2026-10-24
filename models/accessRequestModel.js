const { pool } = require('../config/db');

async function createAccessRequests({ senderId, recipientIds, shareLink, message, expiresAt, requestIds }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requests = [];
    for (const recipientId of recipientIds) {
      const result = await client.query(
        `INSERT INTO access_requests
          (id, sender_id, requester_id, recipient_id, owner_id, share_link, message, expires_at)
         VALUES ($1, $2, $2, $3, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [requestIds[requests.length], senderId, recipientId, shareLink, message || null, expiresAt || null]
      );
      requests.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return requests;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function findReceivedAccessRequests(recipientId) {
  await pool.query(
    `UPDATE access_requests
        SET status = 'expired', updated_at = NOW(), decided_at = COALESCE(decided_at, NOW())
      WHERE recipient_id = $1 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= NOW()`,
    [recipientId]
  );
  const requests = await pool.query(
    `SELECT ar.id, ar.share_link, ar.message, ar.expires_at, ar.status,
            ar.created_at, ar.updated_at, ar.decided_at,
            u.id AS sender_id, u.name AS sender_name, u.email AS sender_email,
            u.role AS sender_role, u.institution AS sender_institution
       FROM access_requests ar
       JOIN users u ON u.id = ar.sender_id
      WHERE ar.recipient_id = $1
      ORDER BY ar.created_at DESC`,
    [recipientId]
  );
  return requests.rows;
}

async function findSentAccessRequests(senderId) {
  await pool.query(
    `UPDATE access_requests
        SET status = 'expired', updated_at = NOW(), decided_at = COALESCE(decided_at, NOW())
      WHERE sender_id = $1 AND status = 'pending' AND expires_at IS NOT NULL AND expires_at <= NOW()`,
    [senderId]
  );
  const requests = await pool.query(
    `SELECT ar.id, ar.share_link, ar.message, ar.expires_at, ar.status,
            ar.created_at, ar.updated_at, ar.decided_at,
            u.id AS recipient_id, u.name AS recipient_name, u.email AS recipient_email,
            u.role AS recipient_role, u.institution AS recipient_institution
       FROM access_requests ar
       JOIN users u ON u.id = ar.recipient_id
      WHERE ar.sender_id = $1
      ORDER BY ar.created_at DESC`,
    [senderId]
  );
  return requests.rows;
}

async function updateAccessRequestStatus(id, userId, status) {
  const isSenderAction = status === 'revoked';
  const ownerColumn = isSenderAction ? 'sender_id' : 'recipient_id';
  const allowedCurrentStatuses = isSenderAction ? ['pending', 'accepted'] : ['pending'];
  const result = await pool.query(
    `UPDATE access_requests
        SET status = $1, updated_at = NOW(), decided_at = NOW()
      WHERE id = $2 AND ${ownerColumn} = $3
        AND status = ANY($4::text[])
        AND (expires_at IS NULL OR expires_at > NOW())
      RETURNING id, sender_id, recipient_id, share_link, message, expires_at,
                status, created_at, updated_at, decided_at`,
    [status, id, userId, allowedCurrentStatuses]
  );
  return result.rows[0];
}

async function updateSentAccessRequest(id, senderId, shareLink, message, expiresAt) {
  const result = await pool.query(
    `UPDATE access_requests
        SET share_link = $1, message = $2, expires_at = $3, updated_at = NOW()
      WHERE id = $4 AND sender_id = $5
        AND status IN ('pending', 'accepted')
      RETURNING id, sender_id, recipient_id, share_link, message, expires_at,
                status, created_at, updated_at, decided_at`,
    [shareLink, message || null, expiresAt || null, id, senderId]
  );
  return result.rows[0];
}

module.exports = {
  createAccessRequests,
  findReceivedAccessRequests,
  findSentAccessRequests,
  updateAccessRequestStatus,
  updateSentAccessRequest,
};
