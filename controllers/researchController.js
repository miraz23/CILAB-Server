const catchAsync = require('../middleware/catchAsync');
const { getPrivateDownloadUrl } = require('../config/cloudinary');
const {
  findPublishedUploads,
  searchPublishedUploads,
  findPublishedUploadById,
} = require('../models/uploadModel');
const AppError = require('../utils/appError');

function splitAuthors(value, fallback) {
  if (Array.isArray(value)) return value.length ? value : [fallback];
  const authors = typeof value === 'string'
    ? value.split(',').map((author) => author.trim()).filter(Boolean)
    : [];
  return authors.length ? authors : [fallback];
}

function serializeResearchUpload(upload) {
  const metadata = upload.metadata || {};
  const isPaper = upload.upload_type === 'paper';
  const authors = splitAuthors(
    isPaper ? metadata.authors_name : metadata.presenter_name,
    upload.author_name
  );

  if (isPaper) {
    return {
      id: upload.id,
      title: upload.title,
      authors,
      venue: metadata.publication_venue || '',
      year: metadata.publication_date
        ? new Date(metadata.publication_date).getFullYear()
        : new Date(upload.created_at).getFullYear(),
      type: metadata.publication_type || 'journal',
      publisher: metadata.publisher || '',
      citedBy: 0,
      topic: metadata.paper_tags || metadata.paper_category || '',
      access: 'open',
      abstract: metadata.paper_abstract || undefined,
      htmlUrl: metadata.paper_url || undefined,
      pdfUrl: upload.cloudinary_url,
      publishedAt: upload.created_at,
      fileSizeMb: Number((Number(upload.file_size) / 1024 / 1024).toFixed(2)),
    };
  }

  return {
    id: upload.id,
    title: upload.title,
    speakers: authors,
    event: metadata.presentation_event || '',
    date: metadata.presentation_date || new Date(upload.created_at).toISOString().slice(0, 10),
    type: metadata.presentation_category || 'Other',
    topic: metadata.presentation_tags || metadata.presentation_category || '',
    slidesUrl: upload.cloudinary_url,
    videoUrl: metadata.paper_url || undefined,
    publishedAt: upload.created_at,
    fileSizeMb: Number((Number(upload.file_size) / 1024 / 1024).toFixed(2)),
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
