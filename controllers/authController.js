const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomBytes, createHash, randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const {
  findUserByEmail,
  findUserByScholarId,
  findPendingRegistrationByEmail,
  findPendingRegistrationByScholarId,
  createPendingRegistration,
  deletePendingRegistration,
  deleteExpiredPendingRegistrations,
  verifyPendingRegistration,
  savePasswordResetToken,
  findUserByPasswordResetToken,
  updatePasswordWithResetToken,
} = require('../models/userModel');
const { sendPasswordResetEmail, sendRegistrationVerificationEmail } = require('../utils/mailer');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

function createToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, appRole: user.app_role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

exports.createToken = createToken;

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
  await deleteExpiredPendingRegistrations();

  const existingEmail = await findUserByEmail(normalizedEmail);
  if (existingEmail) {
    return next(new AppError('Email is already registered.', 409));
  }

  const existingScholarId = await findUserByScholarId(normalizedScholarId);
  if (existingScholarId) {
    return next(new AppError('Scholar ID is already registered.', 409));
  }

  const pendingEmail = await findPendingRegistrationByEmail(normalizedEmail);
  if (pendingEmail) {
    return next(new AppError('A verification email has already been sent to this address.', 409));
  }

  const pendingScholarId = await findPendingRegistrationByScholarId(normalizedScholarId);
  if (pendingScholarId) {
    return next(new AppError('A verification email has already been sent for this Scholar ID.', 409));
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const verificationToken = randomBytes(32).toString('hex');
  const pendingRegistration = {
    id: randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    password: hashedPassword,
    scholarId: normalizedScholarId,
    institution: String(institution).trim(),
    role: String(role).trim(),
    verificationTokenHash: createHash('sha256').update(verificationToken).digest('hex'),
    verificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  await createPendingRegistration(pendingRegistration);
  try {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    await sendRegistrationVerificationEmail(
      normalizedEmail,
      `${clientUrl}/auth/verify-registration?token=${encodeURIComponent(verificationToken)}`
    );
  } catch (error) {
    await deletePendingRegistration(pendingRegistration.id);
    throw error;
  }

  res.status(201).json({
    success: true,
    message: 'Verification email sent. Please check your inbox to complete registration.',
  });
});

exports.verifyRegistration = catchAsync(async (req, res, next) => {
  const token = typeof req.body.token === 'string' ? req.body.token : '';
  if (!token) {
    return next(new AppError('A verification token is required.', 400));
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  let newUser;
  try {
    newUser = await verifyPendingRegistration(tokenHash);
  } catch (error) {
    if (error.code === '23505') {
      return next(new AppError('This registration is no longer available. The email or Scholar ID may already be registered.', 409));
    }
    throw error;
  }

  if (!newUser) {
    return next(new AppError('This verification link is invalid or expired.', 400));
  }

  res.status(201).json({
    success: true,
    message: 'Email verified and account created. You can now sign in.',
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

exports.requestPasswordReset = catchAsync(async (req, res, next) => {
  const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return next(new AppError('Please provide a valid email address.', 400));
  }

  const user = await findUserByEmail(email);
  if (user) {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await savePasswordResetToken(user.id, tokenHash, expiresAt);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    await sendPasswordResetEmail(
      email,
      `${clientUrl}/auth/reset-password?token=${encodeURIComponent(token)}`
    );
  }

  res.json({
    success: true,
    message: 'If an account exists for that email, a password reset link has been sent.',
  });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token, password } = req.body;
  if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 8) {
    return next(new AppError('A valid reset token and a password of at least 8 characters are required.', 400));
  }

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const user = await findUserByPasswordResetToken(tokenHash);
  if (!user) return next(new AppError('This password reset link is invalid or expired.', 400));

  await updatePasswordWithResetToken(user.id, await bcrypt.hash(password, 12));
  res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
});