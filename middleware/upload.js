const multer = require('multer');
const AppError = require('../utils/appError');

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new AppError('Only PDF, PPT, or PPTX files are allowed.', 400));
    }
    callback(null, true);
  },
});

module.exports = upload;
