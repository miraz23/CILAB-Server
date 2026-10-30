const { pool } = require('../config/db');

async function closeSiblingPendingRequests(executor, groupId, fulfilledId) {
  if (!groupId) return;
  await executor.query(
    `UPDATE access_requests
        SET status = 'fulfilled', updated_at = NOW(), decided_at = COALESCE(decided_at, NOW())
      WHERE group_id = $1 AND id <> $2 AND status = 'pending'`,
    [groupId, fulfilledId]
  );
}

async function createAccessRequests({ senderId, recipientIds, shareLink, message, expiresAt, requestIds, groupId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const requests = [];
    for (const recipientId of recipientIds) {
      const result = await client.query(
        `INSERT INTO access_requests
          (id, group_id, sender_id, requester_id, recipient_id, owner_id, share_link, message, expires_at)
         VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [requestIds[requests.length], groupId, senderId, recipientId, shareLink, message || null, expiresAt || null]
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
  await pool.query(
    `UPDATE access_requests ar
        SET status = 'fulfilled', updated_at = NOW(), decided_at = COALESCE(decided_at, NOW())
      WHERE ar.recipient_id = $1
        AND ar.status = 'pending'
        AND ar.group_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM access_requests other
           WHERE other.group_id = ar.group_id
             AND other.id <> ar.id
             AND other.status = 'accepted'
        )`,
    [recipientId]
  );
  const requests = await pool.query(
    `    SELECT ar.id, ar.share_link, ar.message, ar.expires_at,
           ar.paper_url, ar.paper_original_filename, ar.paper_uploaded_at, ar.status,
            ar.created_at, ar.updated_at, ar.decided_at,
            u.id AS sender_id, u.name AS sender_name, u.email AS sender_email,
            u.role AS sender_role, u.institution AS sender_institution
       FROM access_requests ar
       JOIN users u ON u.id = ar.sender_id
      WHERE ar.recipient_id = $1
        AND ar.status <> 'fulfilled'
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
  await pool.query(
    `UPDATE access_requests ar
        SET status = 'fulfilled', updated_at = NOW(), decided_at = COALESCE(decided_at, NOW())
      WHERE ar.sender_id = $1
        AND ar.status = 'pending'
        AND ar.group_id IS NOT NULL
        AND EXISTS (
          SELECT 1
            FROM access_requests other
           WHERE other.group_id = ar.group_id
             AND other.id <> ar.id
             AND other.status = 'accepted'
        )`,
    [senderId]
  );
  const requests = await pool.query(
    `    SELECT ar.id, ar.share_link, ar.message, ar.expires_at,
           ar.paper_url, ar.paper_original_filename, ar.paper_uploaded_at, ar.status,
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
      RETURNING id, group_id, sender_id, recipient_id, share_link, message, expires_at,
                status, created_at, updated_at, decided_at`,
    [status, id, userId, allowedCurrentStatuses]
  );
  const request = result.rows[0];
  if (request && status === 'accepted') {
    await closeSiblingPendingRequests(pool, request.group_id, request.id);
  }
  return request;
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

async function uploadReceivedPaper(id, recipientId, paper) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      `SELECT id, group_id, paper_public_id, status
         FROM access_requests
        WHERE id = $1 AND recipient_id = $2
        FOR UPDATE`,
      [id, recipientId]
    );
    const current = existing.rows[0];
    if (!current || !['pending', 'accepted'].includes(current.status)) {
      await client.query('ROLLBACK');
      return null;
    }

    if (current.group_id && current.status === 'pending') {
      const siblings = await client.query(
        `SELECT id, status
           FROM access_requests
          WHERE group_id = $1 AND id <> $2
          FOR UPDATE`,
        [current.group_id, current.id]
      );
      const fulfilledSibling = siblings.rows.find((row) => row.status === 'accepted');
      if (fulfilledSibling) {
        await closeSiblingPendingRequests(client, current.group_id, fulfilledSibling.id);
        await client.query('COMMIT');
        return null;
      }
    }

    const result = await client.query(
      `UPDATE access_requests
          SET paper_public_id = $1,
              paper_url = $2,
              paper_original_filename = $3,
              paper_mime_type = $4,
              paper_file_size = $5,
              paper_uploaded_at = NOW(),
              status = 'accepted',
              decided_at = COALESCE(decided_at, NOW()),
              updated_at = NOW()
        WHERE id = $6 AND recipient_id = $7
          AND status IN ('pending', 'accepted')
          AND (expires_at IS NULL OR expires_at > NOW())
        RETURNING id, group_id, paper_url, paper_original_filename, paper_uploaded_at, status`,
      [
        paper.publicId,
        paper.url,
        paper.originalFilename,
        paper.mimeType,
        paper.fileSize,
        id,
        recipientId,
      ]
    );
    const updated = result.rows[0];
    if (!updated) {
      await client.query('ROLLBACK');
      return null;
    }

    await closeSiblingPendingRequests(client, updated.group_id, updated.id);
    await client.query('COMMIT');
    return { ...updated, previous_paper_public_id: current.paper_public_id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createAccessRequests,
  findReceivedAccessRequests,
  findSentAccessRequests,
  updateAccessRequestStatus,
  updateSentAccessRequest,
  uploadReceivedPaper,
};
