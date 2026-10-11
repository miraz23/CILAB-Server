const bcrypt = require('bcrypt');
const catchAsync = require('../middleware/catchAsync');
const AppError = require('../utils/appError');
const { getUserById, findUserByEmail, updateUserProfile, findUsers } = require('../models/userModel');

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    scholarId: user.scholar_id,
    institution: user.institution,
    role: user.role,
    appRole: user.app_role,
  };
}

function serializeCollaborator(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    institution: user.institution,
    role: user.role,
  };
}

exports.listCollaborators = catchAsync(async (req, res) => {
  const users = await findUsers({ ...req.query, status: 'active', sort: 'name' });
  const collaborators = users
    .filter((user) => user.id !== req.user.id)
    .map(serializeCollaborator);

  res.json({ success: true, users: collaborators });
});

exports.getProfile = catchAsync(async (req, res) => {
  const user = await getUserById(req.user.id);
  res.json({ success: true, user: serializeUser(user) });
});

exports.updateProfile = catchAsync(async (req, res, next) => {
  const allowed = ['name', 'email', 'scholarId', 'institution', 'role'];
  const changes = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  if (req.body.password) changes.password = await bcrypt.hash(String(req.body.password), 12);
  if (changes.email) {
    const existing = await findUserByEmail(String(changes.email).toLowerCase().trim());
    if (existing && existing.id !== req.user.id) return next(new AppError('Email is already registered.', 409));
  }
  const user = await updateUserProfile(req.user.id, changes);
  if (!user) return next(new AppError('No profile changes were provided.', 400));
  res.json({ success: true, message: 'Profile updated successfully.', user: serializeUser(user) });
});