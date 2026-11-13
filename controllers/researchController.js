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

// "conference" -> "Conference", "early access" -> "Early Access"
function titleCase(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Metadata lists (tags, indexed_in) may be stored as an array or a comma-separated string.
function toList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : [];
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function fileSizeMb(upload) {
  return Number((Number(upload.file_size) / 1024 / 1024).toFixed(2));
}

// Author/presenter emails are intentionally not exposed on this public endpoint.
function serializeResearchUpload(upload) {
  const metadata = upload.metadata || {};
  const isPaper = upload.upload_type === 'paper';
  const authors = splitAuthors(
    isPaper ? metadata.authors_name : metadata.presenter_name,
    upload.author_name
  );

  if (isPaper) {
    const category = toText(metadata.paper_category);
    const tags = toList(metadata.paper_tags);
    return {
      id: upload.id,
      title: upload.title,
      featured: metadata.is_featured === true,
      authors,
      venue: toText(metadata.publication_venue),
      year: metadata.publication_date
        ? new Date(metadata.publication_date).getFullYear()
        : new Date(upload.created_at).getFullYear(),
      publicationDate: toText(metadata.publication_date) || undefined,
      type: titleCase(metadata.publication_type, 'Journal'),
      publisher: toText(metadata.publisher),
      indexedIn: toList(metadata.indexed_in),
      category,
      tags,
      topic: category || tags.join(', '),
      citedBy: 0,
      access: 'open',
      abstract: toText(metadata.paper_abstract) || undefined,
      htmlUrl: toText(metadata.paper_url) || undefined,
      pdfUrl: upload.cloudinary_url,
      fileName: upload.original_filename,
      publishedAt: upload.created_at,
      fileSizeMb: fileSizeMb(upload),
    };
  }

  const category = toText(metadata.presentation_category);
  const tags = toList(metadata.presentation_tags);
  return {
    id: upload.id,
    title: upload.title,
    speakers: authors,
    event: toText(metadata.event_name) || toText(metadata.presentation_event),
    type: titleCase(metadata.presentation_event, 'Other'),
    date: toText(metadata.presentation_date) || new Date(upload.created_at).toISOString().slice(0, 10),
    category,
    tags,
    topic: category || tags.join(', '),
    description: toText(metadata.presentation_description) || undefined,
    slidesUrl: upload.cloudinary_url,
    videoUrl: toText(metadata.paper_url) || undefined,
    fileName: upload.original_filename,
    publishedAt: upload.created_at,
    fileSizeMb: fileSizeMb(upload),
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
