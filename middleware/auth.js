const jwt = require('jsonwebtoken');
const AppError = require('../utils/appError');
const { getUserById, updateLastActive } = require('../models/userModel');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError('Authentication required.', 401));

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return next(new AppError('Invalid or expired authentication token.', 401));
  }

  const user = await getUserById(payload.userId);
  if (!user || user.status === 'suspended') {
    return next(new AppError('Your account cannot access this resource.', 403));
  }
  req.user = user;
  await updateLastActive(user.id);
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.app_role !== 'ADMIN') {
    return next(new AppError('Administrator access required.', 403));
  }
  return next();
}

module.exports = { authenticate, requireAdmin };