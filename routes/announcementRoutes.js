const express = require('express');
const announcementController = require('../controllers/announcementController');
const { authenticate, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();
router.use(authenticate, requireAdmin);
router.get('/', announcementController.list);
router.post('/', announcementController.upsert);
router.patch('/:id', announcementController.upsert);
router.post('/:id/poster', upload.pdfUpload.single('poster'), announcementController.uploadPoster);
router.delete('/:id', announcementController.remove);

module.exports = router;
