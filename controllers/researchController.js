const catchAsync = require('../middleware/catchAsync');
const { getPrivateDownloadUrl } = require('../config/cloudinary');
const {
  findPublishedUploads,
  searchPublishedUploads,
  findPublishedUploadById,
} = require('../models/uploadModel');
const AppError = require('../utils/appError');

function serializeResearchUpload(upload) {
  const fileRoute = upload.upload_type === 'paper' ? 'pdf' : 'presentation';
  return {
    ...upload,
    cloudinary_url: `/api/research/${upload.id}/${fileRoute}`,
  };
}

exports.list = catchAsync(async (req, res) => {
  const uploads = await findPublishedUploads();
  res.json({
    success: true,
    papers: uploads.filter((upload) => upload.upload_type === 'paper').map(serializeResearchUpload),
    presentations: uploads
      .filter((upload) => upload.upload_type === 'presentation')
      .map(serializeResearchUpload),
  });
});

exports.search = catchAsync(async (req, res, next) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) return next(new AppError('A search query is required.', 400));
  if (query.length > 200) return next(new AppError('Search query is too long.', 400));

  const uploads = await searchPublishedUploads(query);
  res.json({
    success: true,
    papers: uploads.filter((upload) => upload.upload_type === 'paper').map(serializeResearchUpload),
    presentations: uploads
      .filter((upload) => upload.upload_type === 'presentation')
      .map(serializeResearchUpload),
  });
});

exports.downloadPaper = catchAsync(async (req, res, next) => {
  const upload = await findPublishedUploadById(req.params.id);
  if (!upload) return next(new AppError('Paper not found.', 404));

  const response = await fetch(getPrivateDownloadUrl(upload.cloudinary_public_id));
  if (!response.ok) return next(new AppError('Unable to retrieve the paper.', 502));

  res.setHeader('Content-Type', upload.mime_type || 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${String(upload.original_filename || 'paper.pdf').replace(/[%"'\r\n]/g, '_')}"`
  );
  res.send(Buffer.from(await response.arrayBuffer()));
});

exports.previewPaper = catchAsync(async (req, res, next) => {
  const upload = await findPublishedUploadById(req.params.id);
  if (!upload) return next(new AppError('Paper not found.', 404));

  const response = await fetch(getPrivateDownloadUrl(upload.cloudinary_public_id));
  if (!response.ok) return next(new AppError('Unable to retrieve the paper.', 502));

  res.setHeader('Content-Type', upload.mime_type || 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.send(Buffer.from(await response.arrayBuffer()));
});

async function deliverPresentation(req, res, next, disposition) {
  const upload = await findPublishedUploadById(req.params.id);
  if (!upload) return next(new AppError('Presentation not found.', 404));

  const response = await fetch(getPrivateDownloadUrl(upload.cloudinary_public_id));
  if (!response.ok) return next(new AppError('Unable to retrieve the presentation.', 502));

  res.setHeader('Content-Type', upload.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', disposition === 'attachment'
    ? `attachment; filename="${String(upload.original_filename || 'presentation').replace(/[%"'\r\n]/g, '_')}"`
    : 'inline');
  res.send(Buffer.from(await response.arrayBuffer()));
}

exports.downloadPresentation = catchAsync((req, res, next) =>
  deliverPresentation(req, res, next, 'attachment'));

exports.previewPresentation = catchAsync((req, res, next) =>
  deliverPresentation(req, res, next, 'inline'));
