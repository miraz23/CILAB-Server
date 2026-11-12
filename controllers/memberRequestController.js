const { randomUUID } = require('crypto');
const catchAsync = require('../middleware/catchAsync');
const AppError = require('../utils/appError');
const {
  findLatestRequestByUserId,
  createMemberRequest,
  findPendingMemberRequests,
  decideMemberRequest,
} = require('../models/memberRequestModel');
const { getUserById } = require('../models/userModel');

function serializeStatus(request) {
  return request
    ? { id: request.id, status: request.status, createdAt: request.created_at, decidedAt: request.decided_at || undefined }
    : null;
}

exports.getStatus = catchAsync(async (req, res) => {
  const user = await getUserById(req.user.id);
  const request = await findLatestRequestByUserId(req.user.id);
  res.json({ success: true, request: serializeStatus(request), appRole: user.app_role });
});

exports.create = catchAsync(async (req, res, next) => {
  const user = await getUserById(req.user.id);
  if (user.app_role !== 'USER') {
    return next(new AppError('Your account already has member access.', 400));
  }

  const existing = await findLatestRequestByUserId(req.user.id);
  if (existing && existing.status === 'pending') {
    return next(new AppError('Your member request is already pending.', 409));
  }

  const request = await createMemberRequest(randomUUID(), req.user.id);
  res.status(201).json({
    success: true,
    message: 'Your request to join as a member was sent to the administrators.',
    request: serializeStatus(request),
  });
});

function serializeAdminRequest(request) {
  return {
    id: request.id,
    user: {
      id: request.user_id,
      name: request.name,
      email: request.email,
      scholarId: request.scholar_id,
      institution: request.institution,
      academicRole: request.role,
      appRole: request.app_role,
    },
    status: request.status,
    createdAt: request.created_at,
    decidedAt: request.decided_at || undefined,
  };
}

exports.listPending = catchAsync(async (req, res) => {
  const requests = await findPendingMemberRequests();
  res.json({ success: true, requests: requests.map(serializeAdminRequest) });
});

exports.decide = catchAsync(async (req, res, next) => {
  const status = req.body.status;
  if (!['approved', 'declined'].includes(status)) {
    return next(new AppError('A valid member request decision is required.', 400));
  }
  const request = await decideMemberRequest(req.params.id, status);
  if (!request) return next(new AppError('Member request not found or already decided.', 404));
  res.json({ success: true, message: `Member request ${status}.`, request: serializeStatus(request) });
});
