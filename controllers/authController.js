const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const { findUserByEmail, findUserByScholarId, createUser } = require('../models/userModel');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

function createToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, appRole: user.app_role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password, scholarId, institution, role } = req.body;

  if (!name || !email || !password || !scholarId || !institution || !role) {
    return next(new AppError('Missing required registration fields.', 400));
  }

  if (typeof email !== 'string' || !email.includes('@')) {
    return next(new AppError('Please provide a valid email address.', 400));
  }

  if (typeof password !== 'string' || password.length < 8) {
    return next(new AppError('Password must be at least 8 characters.', 400));
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedScholarId = String(scholarId).trim();

  const existingEmail = await findUserByEmail(normalizedEmail);
  if (existingEmail) {
    return next(new AppError('Email is already registered.', 409));
  }

  const existingScholarId = await findUserByScholarId(normalizedScholarId);
  if (existingScholarId) {
    return next(new AppError('Scholar ID is already registered.', 409));
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const newUser = await createUser({
    id: randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    password: hashedPassword,
    scholarId: normalizedScholarId,
    institution: String(institution).trim(),
    role: String(role).trim(),
    appRole: 'USER',
  });

  res.status(201).json({
    success: true,
    message: 'Account created.',
    userId: newUser.id,
  });
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Email and password are required.', 400));
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    return next(new AppError('Invalid email or password.', 401));
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return next(new AppError('Invalid email or password.', 401));
  }

  const token = createToken(user);

  res.status(200).json({
    success: true,
    message: 'Logged in successfully.',
    userId: user.id,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      scholarId: user.scholar_id,
      institution: user.institution,
      role: user.role,
      appRole: user.app_role,
      status: user.status,
    },
    token,
  });
});