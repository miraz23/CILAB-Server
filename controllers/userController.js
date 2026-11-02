const bcrypt = require('bcrypt');
const catchAsync = require('../middleware/catchAsync');
const AppError = require('../utils/appError');
const {
  getUserById,
  findUserByEmail,
  findUserByScholarId,
  updateUserProfile,
  findUsers,
} = require('../models/userModel');

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
  if (changes.name !== undefined && (!String(changes.name).trim() || String(changes.name).trim().length < 2)) {
    return next(new AppError('Name must be at least 2 characters.', 400));
  }
  if (changes.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(changes.email).trim())) {
    return next(new AppError('Please provide a valid email address.', 400));
  }
  if (changes.scholarId !== undefined && !String(changes.scholarId).trim()) {
    return next(new AppError('Scholar ID is required.', 400));
  }
  if (changes.institution !== undefined && !String(changes.institution).trim()) {
    return next(new AppError('Institution is required.', 400));
  }
  if (changes.role !== undefined && !String(changes.role).trim()) {
    return next(new AppError('Academic role is required.', 400));
  }
  if (req.body.password !== undefined && (typeof req.body.password !== 'string' || req.body.password.length < 8)) {
    return next(new AppError('Password must be at least 8 characters.', 400));
  }
  if (req.body.password) changes.password = await bcrypt.hash(String(req.body.password), 12);
  if (changes.email) {
    const existing = await findUserByEmail(String(changes.email).toLowerCase().trim());
    if (existing && existing.id !== req.user.id) return next(new AppError('Email is already registered.', 409));
  }
  if (changes.scholarId) {
    const existing = await findUserByScholarId(String(changes.scholarId).trim());
    if (existing && existing.id !== req.user.id) return next(new AppError('Scholar ID is already registered.', 409));
  }
  const user = await updateUserProfile(req.user.id, changes);
  if (!user) return next(new AppError('No profile changes were provided.', 400));
  res.json({ success: true, message: 'Profile updated successfully.', user: serializeUser(user) });
});