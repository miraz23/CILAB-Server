const express = require('express');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const uploadController = require('../controllers/uploadController');

const router = express.Router();
router.use(authenticate);
router.post('/papers/upload', upload.pdfUpload.single('paper_file'), uploadController.uploadPaper);
router.post('/presentations/upload', upload.single('presentation_file'), uploadController.uploadPresentation);
router.get('/uploads/stats', uploadController.getMyUploadStats);
router.get('/uploads', uploadController.getMyUploads);
router.get('/uploads/:id/file', uploadController.downloadMyUpload);
router.patch('/uploads/:id', uploadController.updateMyUpload);
router.delete('/uploads/:id', uploadController.deleteMyUpload);

module.exports = router;
