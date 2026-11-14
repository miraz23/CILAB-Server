const express = require('express');
const { authenticate, requireUploadAccess } = require('../middleware/auth');
const upload = require('../middleware/upload');
const uploadController = require('../controllers/uploadController');

const router = express.Router();
router.post('/papers/upload', authenticate, requireUploadAccess, upload.pdfUpload.single('paper_file'), uploadController.uploadPaper);
router.post('/papers/upload/signature', authenticate, requireUploadAccess, uploadController.createPaperUploadSignature);
router.post('/papers/upload/finalize', authenticate, requireUploadAccess, uploadController.finalizePaperUpload);
router.post('/presentations/upload', authenticate, requireUploadAccess, upload.single('presentation_file'), uploadController.uploadPresentation);
router.get('/uploads/stats', authenticate, requireUploadAccess, uploadController.getMyUploadStats);
router.get('/uploads', authenticate, requireUploadAccess, uploadController.getMyUploads);
router.get('/uploads/:id/file', authenticate, requireUploadAccess, uploadController.downloadMyUpload);
router.patch('/uploads/:id', authenticate, requireUploadAccess, upload.replacementUpload, uploadController.updateMyUpload);
router.delete('/uploads/:id', authenticate, requireUploadAccess, uploadController.deleteMyUpload);

module.exports = router;
