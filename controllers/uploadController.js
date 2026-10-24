const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const { uploadBuffer, destroyResource } = require('../config/cloudinary');
const {
  createUpload,
  findUploadsByUser,
  getUploadStatsByUser,
  updateUploadByUser,
  deleteUploadByUser,
} = require('../models/uploadModel');

const paperCategories = new Set([
  'Machine Learning', 'Computer Vision', 'NLP', 'Graph Neural Networks',
  'Optimization', 'Robotics', 'Reinforcement Learning', 'Other',
]);
const presentationTypes = new Set([
  'Conference Talk', 'Workshop', 'Seminar', 'Poster Session', 'Demo Session',
  'Tutorial', 'Keynote', 'Panel Discussion', 'Other',
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getMetadata(req, type) {
  return type === 'paper'
    ? {
        authors: text(req.body.authors),
        abstract: text(req.body.abstract),
        category: text(req.body.category),
        tags: text(req.body.tags),
        publicationLink: text(req.body.publicationLink),
      }
    : {
        event: text(req.body.event),
        date: text(req.body.date),
        presentationType: text(req.body.type),
        description: text(req.body.description),
        publicationLink: text(req.body.publicationLink),
      };
}

async function handleUpload(req, res, next, type) {
  if (!req.file) return next(new AppError('A file is required.', 400));
  const title = text(req.body.title);
  if (!title) return next(new AppError(`${type === 'paper' ? 'Paper' : 'Presentation'} title is required.`, 400));

  if (type === 'paper' && !paperCategories.has(text(req.body.category))) {
    return next(new AppError('Please provide a valid paper category.', 400));
  }
  if (type === 'presentation' && !presentationTypes.has(text(req.body.type))) {
    return next(new AppError('Please provide a valid presentation type.', 400));
  }

  const folder = `cilab/${req.user.id}/${type}s`;
  const cloudinaryResult = await uploadBuffer(req.file.buffer, {
    folder,
    resource_type: 'raw',
    use_filename: true,
    unique_filename: true,
    overwrite: false,
  });

  const metadata = getMetadata(req, type);

  const upload = await createUpload({
    id: randomUUID(),
    userId: req.user.id,
    type,
    title,
    metadata,
    originalFilename: req.file.originalname,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    publicId: cloudinaryResult.public_id,
    url: cloudinaryResult.secure_url,
  });

  res.status(201).json({ success: true, message: `${type === 'paper' ? 'Paper' : 'Presentation'} uploaded successfully.`, upload });
}

exports.uploadPaper = catchAsync((req, res, next) => handleUpload(req, res, next, 'paper'));
exports.uploadPresentation = catchAsync((req, res, next) => handleUpload(req, res, next, 'presentation'));
exports.getMyUploads = catchAsync(async (req, res) => {
  const uploads = await findUploadsByUser(req.user.id);
  res.json({ success: true, uploads });
});
exports.getMyUploadStats = catchAsync(async (req, res) => {
  const stats = await getUploadStatsByUser(req.user.id);
  res.json({ success: true, stats });
});

exports.updateMyUpload = catchAsync(async (req, res, next) => {
  const upload = await findUploadsByUser(req.user.id);
  const existing = upload.find((item) => item.id === req.params.id);
  if (!existing) return next(new AppError('Upload not found.', 404));

  const title = text(req.body.title);
  const type = existing.upload_type;
  const categoryOrType = type === 'paper' ? text(req.body.category) : text(req.body.type);
  if (!title) {
    return next(new AppError(`${type === 'paper' ? 'Paper' : 'Presentation'} title is required.`, 400));
  }
  if (type === 'paper' && !paperCategories.has(categoryOrType)) {
    return next(new AppError('Please provide a valid paper category.', 400));
  }
  if (type === 'presentation' && !presentationTypes.has(categoryOrType)) {
    return next(new AppError('Please provide a valid presentation type.', 400));
  }

  const updated = await updateUploadByUser(req.params.id, req.user.id, title, getMetadata(req, type));
  res.json({ success: true, message: 'Upload updated successfully.', upload: updated });
});

exports.deleteMyUpload = catchAsync(async (req, res, next) => {
  const uploads = await findUploadsByUser(req.user.id);
  const existing = uploads.find((item) => item.id === req.params.id);
  if (!existing) return next(new AppError('Upload not found.', 404));

  await destroyResource(existing.cloudinary_public_id, { resource_type: 'raw' });
  await deleteUploadByUser(req.params.id, req.user.id);
  res.json({ success: true, message: 'Upload deleted successfully.' });
});
