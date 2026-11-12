const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const { findUsers, updateUserAccess } = require('../models/userModel');
const {
  findModerationUploads,
  findModerationUploadById,
  updateUploadModeration,
} = require('../models/uploadModel');
const { getPrivateDownloadUrl } = require('../config/cloudinary');
const { getPlatformStats } = require('../models/analyticsModel');

exports.getPlatformStats = catchAsync(async (req, res) => {
  const stats = await getPlatformStats();
  res.json({ success: true, message: 'Platform analytics loaded.', stats });
});

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
    papersCount: Number(user.papers_count || 0),
    presentationsCount: Number(user.presentations_count || 0),
  };
}

exports.listUsers = catchAsync(async (req, res) => {
  const users = await findUsers(req.query);
  res.json({ success: true, message: 'Users loaded.', users: users.map(serializeUser), total: users.length });
});

exports.updateAccess = catchAsync(async (req, res, next) => {
  const { appRole, status } = req.body;
  if ((appRole !== undefined && !['USER', 'MEMBER', 'ADMIN'].includes(appRole)) ||
      (status !== undefined && !['active', 'pending', 'suspended'].includes(status))) {
    return next(new AppError('Invalid access role or status.', 400));
  }
  if (req.params.id === req.user.id && (appRole !== undefined && appRole !== 'ADMIN' || status === 'suspended')) {
    return next(new AppError('You cannot remove your own administrator access.', 400));
  }
  const user = await updateUserAccess(req.params.id, { appRole, status });
  if (!user) return next(new AppError('User not found or no access changes were provided.', 404));
  res.json({ success: true, message: 'User access updated.', user: serializeUser(user) });
});

function serializeModerationUpload(upload) {
  const isPaper = upload.upload_type === 'paper';
  return {
    id: upload.id,
    contentType: upload.upload_type,
    title: upload.title,
    category: isPaper
      ? upload.metadata.paper_category || 'Other'
      : upload.metadata.presentation_event || 'Other',
    author: {
      id: upload.author_id,
      name: upload.author_name,
      academicRole: upload.author_role,
      institution: upload.author_institution,
    },
    fileUrl: upload.cloudinary_url,
    fileDownloadUrl: `/api/admin/moderation/${upload.id}/file`,
    originalFilename: upload.original_filename,
    mimeType: upload.mime_type,
    fileSizeMb: Number((Number(upload.file_size) / 1024 / 1024).toFixed(2)),
    metadata: upload.metadata || {},
    submittedAt: upload.created_at,
    status: upload.status,
    reviewNote: upload.review_note || undefined,
    reviewedAt: upload.reviewed_at || undefined,
  };
}

exports.downloadModerationUpload = catchAsync(async (req, res, next) => {
  const upload = await findModerationUploadById(req.params.id);
  if (!upload) return next(new AppError('Upload not found.', 404));

  const response = await fetch(getPrivateDownloadUrl(upload.cloudinary_public_id));
  if (!response.ok) return next(new AppError('Unable to retrieve the uploaded file.', 502));

  res.setHeader('Content-Type', upload.mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${String(upload.original_filename || 'upload').replace(/[%"'\r\n]/g, '_')}"`
  );
  res.send(Buffer.from(await response.arrayBuffer()));
});

exports.previewModerationUpload = catchAsync(async (req, res, next) => {
  const upload = await findModerationUploadById(req.params.id);
  if (!upload) return next(new AppError('Upload not found.', 404));

  const response = await fetch(getPrivateDownloadUrl(upload.cloudinary_public_id));
  if (!response.ok) return next(new AppError('Unable to retrieve the uploaded file.', 502));

  res.setHeader('Content-Type', upload.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'inline');
  res.send(Buffer.from(await response.arrayBuffer()));
});

exports.listModerationUploads = catchAsync(async (req, res) => {
  const uploads = await findModerationUploads({
    contentType: req.query.contentType,
    status: req.query.status,
    search: req.query.search,
  });
  res.json({
    success: true,
    submissions: uploads.map(serializeModerationUpload),
    total: uploads.length,
  });
});

exports.updateModerationUpload = catchAsync(async (req, res, next) => {
  const { decision, note, featured } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    return next(new AppError('A valid moderation decision is required.', 400));
  }
  if (note !== undefined && typeof note !== 'string') {
    return next(new AppError('Review note must be text.', 400));
  }
  if (featured !== undefined && typeof featured !== 'boolean') {
    return next(new AppError('Featured status must be boolean.', 400));
  }

  const upload = await updateUploadModeration(
    req.params.id,
    decision,
    typeof note === 'string' ? note.trim() : '',
    req.user.id,
    featured
  );
  if (!upload) return next(new AppError('Upload not found.', 404));

  res.json({
    success: true,
    message: `Upload ${decision}.`,
    upload,
  });
});