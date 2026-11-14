const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const catchAsync = require('../middleware/catchAsync');
const {
  uploadBuffer,
  destroyResource,
  getOriginalFilename,
  getPrivateDownloadUrl,
  createDirectUploadSignature,
} = require('../config/cloudinary');
const {
  createUpload,
  findUploadsByUser,
  getUploadStatsByUser,
  updateUploadByUser,
  deleteUploadByUser,
} = require('../models/uploadModel');

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function getMetadata(req, type) {
  return type === 'paper'
    ? {
        authors_name: list(req.body.authors_name),
        authors_email: list(req.body.authors_email),
        paper_category: text(req.body.paper_category),
        publication_type: text(req.body.publication_type),
        publication_venue: text(req.body.publication_venue),
        publisher: text(req.body.publisher),
        indexed_in: list(req.body.indexed_in),
        publication_date: text(req.body.publication_date),
        paper_tags: text(req.body.paper_tags),
        paper_url: text(req.body.paper_url),
        paper_abstract: text(req.body.paper_abstract),
      }
    : {
        presenter_name: list(req.body.presenter_name),
        presenter_email: list(req.body.presenter_email),
        presentation_category: text(req.body.presentation_category),
        presentation_event: text(req.body.presentation_event),
        presentation_date: text(req.body.presentation_date),
        presentation_tags: text(req.body.presentation_tags),
        event_name: text(req.body.event_name),
        paper_url: text(req.body.paper_url),
        presentation_description: text(req.body.presentation_description),
      };
}

function getDirectUploadDetails(req, type) {
  const requestedFilename = text(req.body.filename);
  if (!requestedFilename) {
    throw new AppError('A file name is required.', 400);
  }
  const filename = getOriginalFilename(requestedFilename);

  const folder = `cilab/${req.user.id}/${type}s`;
  const publicId = `${filename.replace(/\.[^.]+$/, '')}-${randomUUID()}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createDirectUploadSignature({ folder, public_id: publicId, timestamp });

  return {
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
    publicId,
    resourceType: 'raw',
    timestamp,
    signature,
  };
}

async function handleUpload(req, res, next, type) {
  if (!req.file) return next(new AppError('A file is required.', 400));
  const title = text(req.body[type === 'paper' ? 'paper_title' : 'presentation_title']);
  if (!title) return next(new AppError(`${type === 'paper' ? 'Paper' : 'Presentation'} title is required.`, 400));

  const folder = `cilab/${req.user.id}/${type}s`;
  const cloudinaryResult = await uploadBuffer(req.file.buffer, {
    folder,
    resource_type: 'raw',
    public_id: getOriginalFilename(req.file.originalname),
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
    status: req.user.app_role === 'ADMIN' ? 'approved' : 'pending',
    reviewedBy: req.user.app_role === 'ADMIN' ? req.user.id : null,
  });

  res.status(201).json({ success: true, message: `${type === 'paper' ? 'Paper' : 'Presentation'} uploaded successfully.`, upload });
}

exports.createPaperUploadSignature = catchAsync(async (req, res) => {
  const details = getDirectUploadDetails(req, 'paper');
  res.json({ success: true, upload: details });
});

exports.finalizePaperUpload = catchAsync(async (req, res, next) => {
  const publicId = text(req.body.cloudinary_public_id);
  const originalFilename = text(req.body.original_filename);
  const mimeType = text(req.body.mime_type);
  const cloudinaryUrl = text(req.body.cloudinary_url);
  const fileSize = Number(req.body.file_size);
  const expectedFolder = `cilab/${req.user.id}/papers/`;

  if (!publicId || !publicId.startsWith(expectedFolder) || !originalFilename || !cloudinaryUrl) {
    return next(new AppError('The uploaded file is invalid.', 400));
  }
  if (mimeType !== 'application/pdf' || !Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 50 * 1024 * 1024) {
    return next(new AppError('Only PDF files up to 50MB are allowed.', 400));
  }

  const title = text(req.body.paper_title);
  if (!title) return next(new AppError('Paper title is required.', 400));

  const metadata = getMetadata(req, 'paper');
  const upload = await createUpload({
    id: randomUUID(),
    userId: req.user.id,
    type: 'paper',
    title,
    metadata,
    originalFilename,
    mimeType,
    fileSize,
    publicId,
    url: cloudinaryUrl,
    status: req.user.app_role === 'ADMIN' ? 'approved' : 'pending',
    reviewedBy: req.user.app_role === 'ADMIN' ? req.user.id : null,
  });

  res.status(201).json({ success: true, message: 'Paper uploaded successfully.', upload });
});

exports.uploadPaper = catchAsync((req, res, next) => handleUpload(req, res, next, 'paper'));
exports.uploadPresentation = catchAsync((req, res, next) => handleUpload(req, res, next, 'presentation'));
exports.getMyUploads = catchAsync(async (req, res) => {
  const uploads = await findUploadsByUser(req.user.id, req.user.email);
  res.json({
    success: true,
    uploads: uploads.map((upload) => ({
      ...upload,
      cloudinary_url: `/api/uploads/${upload.id}/file`,
    })),
  });
});

exports.downloadMyUpload = catchAsync(async (req, res, next) => {
  const uploads = await findUploadsByUser(req.user.id, req.user.email);
  const upload = uploads.find((item) => item.id === req.params.id);
  if (!upload) return next(new AppError('Upload not found.', 404));

  const response = await fetch(getPrivateDownloadUrl(upload.cloudinary_public_id));
  if (!response.ok) {
    return next(new AppError('Unable to retrieve the uploaded file.', 502));
  }

  res.setHeader('Content-Type', upload.mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${getOriginalFilename(upload.original_filename)}"`
  );
  res.send(Buffer.from(await response.arrayBuffer()));
});
exports.getMyUploadStats = catchAsync(async (req, res) => {
  const stats = await getUploadStatsByUser(req.user.id, req.user.email);
  res.json({ success: true, stats });
});

exports.updateMyUpload = catchAsync(async (req, res, next) => {
  const upload = await findUploadsByUser(req.user.id, req.user.email);
  const existing = upload.find((item) => item.id === req.params.id);
  if (!existing) return next(new AppError('Upload not found.', 404));
  const replacementFile = req.files?.paper_file?.[0] || req.files?.presentation_file?.[0];
  if (replacementFile && existing.upload_type === 'paper' && replacementFile.mimetype !== 'application/pdf') {
    return next(new AppError('Only PDF files can replace a paper.', 400));
  }

  const type = existing.upload_type;
  const title = text(req.body[type === 'paper' ? 'paper_title' : 'presentation_title']);
  const categoryOrType = type === 'paper'
    ? text(req.body.paper_category)
    : text(req.body.presentation_event);
  if (!title) {
    return next(new AppError(`${type === 'paper' ? 'Paper' : 'Presentation'} title is required.`, 400));
  }
  if (!categoryOrType) {
    return next(new AppError(`${type === 'paper' ? 'Paper category' : 'Presentation event'} is required.`, 400));
  }

  let replacement = null;
  if (replacementFile) {
    const cloudinaryResult = await uploadBuffer(replacementFile.buffer, {
      folder: `cilab/${req.user.id}/${existing.upload_type}s`,
      resource_type: 'raw',
      public_id: `${existing.cloudinary_public_id}-replacement-${randomUUID()}`,
      overwrite: false,
    });
    replacement = {
      originalFilename: replacementFile.originalname,
      mimeType: replacementFile.mimetype,
      fileSize: replacementFile.size,
      publicId: cloudinaryResult.public_id,
      url: cloudinaryResult.secure_url,
    };
  }

  let updated;
  try {
    updated = await updateUploadByUser(
      req.params.id,
      req.user.id,
      req.user.email,
      title,
      getMetadata(req, type),
      replacement,
      req.user.app_role === 'ADMIN',
      req.user.app_role === 'ADMIN' ? req.user.id : null
    );
  } catch (error) {
    if (replacement) {
      await destroyResource(replacement.publicId, { resource_type: 'raw' });
    }
    throw error;
  }
  if (!updated) {
    if (replacement) {
      await destroyResource(replacement.publicId, { resource_type: 'raw' });
    }
    return next(new AppError('Unable to update this upload.', 404));
  }

  if (replacement && existing.cloudinary_public_id !== updated.cloudinary_public_id) {
    try {
      await destroyResource(existing.cloudinary_public_id, { resource_type: 'raw' });
    } catch (error) {
      console.error('Unable to remove the previous upload after replacement.', error);
    }
  }
  res.json({
    success: true,
    message: 'Upload updated successfully.',
    upload: { ...updated, cloudinary_url: `/api/uploads/${updated.id}/file` },
  });
});

exports.deleteMyUpload = catchAsync(async (req, res, next) => {
  const uploads = await findUploadsByUser(req.user.id, req.user.email);
  const existing = uploads.find((item) => item.id === req.params.id);
  if (!existing) return next(new AppError('Upload not found.', 404));

  await destroyResource(existing.cloudinary_public_id, { resource_type: 'raw' });
  await deleteUploadByUser(req.params.id, req.user.id, req.user.email);
  res.json({ success: true, message: 'Upload deleted successfully.' });
});
