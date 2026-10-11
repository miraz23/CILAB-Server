const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const { uploadBuffer } = require('../config/cloudinary');
const { createUpload, findUploadsByUser } = require('../models/uploadModel');

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

  const metadata = type === 'paper'
    ? {
        authors: text(req.body.authors),
        abstract: text(req.body.abstract),
        category: text(req.body.category),
        tags: text(req.body.tags),
      }
    : {
        event: text(req.body.event),
        date: text(req.body.date),
        presentationType: text(req.body.type),
        description: text(req.body.description),
      };

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
