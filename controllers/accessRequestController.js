const { URL } = require('url');
const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const { getUserById } = require('../models/userModel');
const {
  createAccessRequests,
  findReceivedAccessRequests,
  updateAccessRequestStatus,
} = require('../models/accessRequestModel');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function serializeReceivedRequest(request) {
  return {
    id: request.id,
    fromUser: {
      id: request.sender_id,
      name: request.sender_name,
      email: request.sender_email,
      role: request.sender_role,
      institution: request.sender_institution,
    },
    shareLink: request.share_link,
    message: request.message || undefined,
    expiresAt: request.expires_at || undefined,
    status: request.status,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    decidedAt: request.decided_at || undefined,
  };
}

function serializeUpdatedRequest(request) {
  return {
    id: request.id,
    shareLink: request.share_link,
    message: request.message || undefined,
    expiresAt: request.expires_at || undefined,
    status: request.status,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    decidedAt: request.decided_at || undefined,
  };
}

exports.create = catchAsync(async (req, res, next) => {
  const shareLink = text(req.body.shareLink);
  const message = text(req.body.message);
  const userIds = Array.isArray(req.body.userIds)
    ? [...new Set(req.body.userIds.map((id) => text(id)).filter(Boolean))]
    : [];
  if (!shareLink || !userIds.length) {
    return next(new AppError('A share link and at least one recipient are required.', 400));
  }
  try {
    const parsedLink = new URL(shareLink);
    if (!['http:', 'https:'].includes(parsedLink.protocol)) throw new Error();
  } catch {
    return next(new AppError('Please provide a valid share link.', 400));
  }
  if (userIds.includes(req.user.id)) {
    return next(new AppError('You cannot send an access request to yourself.', 400));
  }

  let expiresAt = null;
  if (req.body.expiresAt) {
    const parsedExpiry = new Date(req.body.expiresAt);
    if (Number.isNaN(parsedExpiry.getTime()) || parsedExpiry <= new Date()) {
      return next(new AppError('Expiration must be a valid future date.', 400));
    }
    expiresAt = parsedExpiry.toISOString();
  }

  const recipients = await Promise.all(userIds.map((id) => getUserById(id)));
  if (recipients.some((user) => !user || user.status === 'suspended')) {
    return next(new AppError('One or more recipients could not be found.', 404));
  }
  const requests = await createAccessRequests({
    senderId: req.user.id,
    recipientIds: userIds,
    requestIds: userIds.map(() => randomUUID()),
    shareLink,
    message: message || null,
    expiresAt,
  });
  res.status(201).json({
    success: true,
    message: 'Access request created.',
    requestId: requests[0].id,
    requestIds: requests.map((request) => request.id),
  });
});

exports.listReceived = catchAsync(async (req, res) => {
  const requests = await findReceivedAccessRequests(req.user.id);
  res.json({
    success: true,
    message: 'Received access requests loaded.',
    requests: requests.map(serializeReceivedRequest),
  });
});

exports.updateStatus = catchAsync(async (req, res, next) => {
  const requestedStatus = text(req.body.status || req.body.action).toLowerCase();
  const status = requestedStatus === 'accept' ? 'accepted'
    : requestedStatus === 'decline' ? 'declined'
      : requestedStatus;
  if (!['accepted', 'declined', 'revoked'].includes(status)) {
    return next(new AppError('Status must be accepted, declined, or revoked.', 400));
  }
  const request = await updateAccessRequestStatus(req.params.id, req.user.id, status);
  if (!request) {
    return next(new AppError('Request was not found, has expired, or cannot be updated.', 404));
  }
  res.json({
    success: true,
    message: `Access request ${status}.`,
    request: serializeUpdatedRequest(request),
  });
});
