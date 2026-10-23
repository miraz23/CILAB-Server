const catchAsync = require('../middleware/catchAsync');
const { findPublishedUploads } = require('../models/uploadModel');

function splitAuthors(value, fallback) {
  const authors = typeof value === 'string'
    ? value.split(',').map((author) => author.trim()).filter(Boolean)
    : [];
  return authors.length ? authors : [fallback];
}

function serializeResearchUpload(upload) {
  const metadata = upload.metadata || {};
  const isPaper = upload.upload_type === 'paper';
  const authors = splitAuthors(isPaper ? metadata.authors : '', upload.author_name);

  if (isPaper) {
    return {
      id: upload.id,
      title: upload.title,
      authors,
      venue: metadata.category || '',
      year: new Date(upload.created_at).getFullYear(),
      type: 'Early Access',
      publisher: '',
      citedBy: 0,
      topic: metadata.tags || metadata.category || '',
      access: 'open',
      abstract: metadata.abstract || undefined,
      htmlUrl: metadata.publicationLink || undefined,
      pdfUrl: upload.cloudinary_url,
      publishedAt: upload.created_at,
      fileSizeMb: Number((Number(upload.file_size) / 1024 / 1024).toFixed(2)),
    };
  }

  return {
    id: upload.id,
    title: upload.title,
    speakers: authors,
    event: metadata.event || '',
    date: metadata.date || new Date(upload.created_at).toISOString().slice(0, 10),
    type: metadata.presentationType || 'Other',
    topic: metadata.presentationType || '',
    abstract: metadata.description || undefined,
    slidesUrl: upload.cloudinary_url,
    videoUrl: metadata.publicationLink || undefined,
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
