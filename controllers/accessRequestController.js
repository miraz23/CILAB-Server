const { URL } = require('url');
const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const { uploadBuffer, destroyResource } = require('../config/cloudinary');
const { getUserById } = require('../models/userModel');
const {
  createAccessRequests,
  findReceivedAccessRequests,
  findSentAccessRequests,
  updateAccessRequestStatus,
  updateSentAccessRequest,
  uploadReceivedPaper,
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
    paper: request.paper_url
      ? {
          url: request.paper_url,
          originalFilename: request.paper_original_filename,
          uploadedAt: request.paper_uploaded_at,
        }
      : undefined,
    message: request.message || undefined,
    expiresAt: request.expires_at || undefined,
    status: request.status,
    createdAt: request.created_at,
    updatedAt: request.updated_at,
    decidedAt: request.decided_at || undefined,
  };
}

function serializeSentRequest(request) {
  return {
    id: request.id,
    toUser: {
      id: request.recipient_id,
      name: request.recipient_name,
      email: request.recipient_email,
      role: request.recipient_role,
      institution: request.recipient_institution,
    },
    shareLink: request.share_link,
    paper: request.paper_url
      ? {
          url: request.paper_url,
          originalFilename: request.paper_original_filename,
          uploadedAt: request.paper_uploaded_at,
        }
      : undefined,
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
    groupId: randomUUID(),
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

exports.listSent = catchAsync(async (req, res) => {
  const requests = await findSentAccessRequests(req.user.id);
  res.json({
    success: true,
    message: 'Sent access requests loaded.',
    requests: requests.map(serializeSentRequest),
  });
});

exports.updateSent = catchAsync(async (req, res, next) => {
  const shareLink = text(req.body.shareLink);
  if (!shareLink) return next(new AppError('A share link is required.', 400));
  try {
    const parsedLink = new URL(shareLink);
    if (!['http:', 'https:'].includes(parsedLink.protocol)) throw new Error();
  } catch {
    return next(new AppError('Please provide a valid share link.', 400));
  }

  let expiresAt = null;
  if (req.body.expiresAt) {
    const parsedExpiry = new Date(req.body.expiresAt);
    if (Number.isNaN(parsedExpiry.getTime()) || parsedExpiry <= new Date()) {
      return next(new AppError('Expiration must be a valid future date.', 400));
    }
    expiresAt = parsedExpiry.toISOString();
  }

  const request = await updateSentAccessRequest(
    req.params.id,
    req.user.id,
    shareLink,
    text(req.body.message),
    expiresAt
  );
  if (!request) return next(new AppError('Request was not found or cannot be edited.', 404));

  res.json({
    success: true,
    message: 'Access request updated.',
    request: serializeUpdatedRequest(request),
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

exports.uploadPaper = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('A PDF file is required.', 400));

  const cloudinaryResult = await uploadBuffer(req.file.buffer, {
    folder: `cilab/${req.user.id}/access-request-papers`,
    resource_type: 'raw',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });

  const request = await uploadReceivedPaper(req.params.id, req.user.id, {
    publicId: cloudinaryResult.public_id,
    url: cloudinaryResult.secure_url,
    originalFilename: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
  });

  if (!request) {
    await destroyResource(cloudinaryResult.public_id, { resource_type: 'raw' });
    return next(new AppError('Request was not found, has expired, or cannot receive a paper.', 404));
  }

  if (request.previous_paper_public_id && request.previous_paper_public_id !== cloudinaryResult.public_id) {
    try {
      await destroyResource(request.previous_paper_public_id, { resource_type: 'raw' });
    } catch (error) {
      console.error('Unable to remove the previous requested paper from Cloudinary:', error);
    }
  }

  res.status(201).json({
    success: true,
    message: 'Requested paper uploaded successfully.',
    paper: {
      url: request.paper_url,
      originalFilename: request.paper_original_filename,
      uploadedAt: request.paper_uploaded_at,
    },
    status: request.status,
  });
});
