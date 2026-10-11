const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const { findUsers, updateUserAccess } = require('../models/userModel');

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    scholarId: user.scholar_id,
    institution: user.institution,
    academicRole: user.role,
    appRole: user.app_role,
    status: user.status,
    joinedAt: user.created_at,
    lastActiveAt: user.last_active_at || undefined,
    papersCount: 0,
    presentationsCount: 0,
  };
}

exports.listUsers = catchAsync(async (req, res) => {
  const users = await findUsers(req.query);
  res.json({ success: true, message: 'Users loaded.', users: users.map(serializeUser), total: users.length });
});

exports.updateAccess = catchAsync(async (req, res, next) => {
  const { appRole, status } = req.body;
  if ((appRole !== undefined && !['USER', 'ADMIN'].includes(appRole)) ||
      (status !== undefined && !['active', 'pending', 'suspended'].includes(status))) {
    return next(new AppError('Invalid access role or status.', 400));
  }
  if (req.params.id === req.user.id && (appRole === 'USER' || status === 'suspended')) {
    return next(new AppError('You cannot remove your own administrator access.', 400));
  }
  const user = await updateUserAccess(req.params.id, { appRole, status });
  if (!user) return next(new AppError('User not found or no access changes were provided.', 404));
  res.json({ success: true, message: 'User access updated.', user: serializeUser(user) });
});