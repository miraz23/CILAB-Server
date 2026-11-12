const express = require('express');
const { authenticate, requireMemberAccess } = require('../middleware/auth');
const upload = require('../middleware/upload');
const accessRequestController = require('../controllers/accessRequestController');

const router = express.Router();
router.use(authenticate);
router.post('/', accessRequestController.create);
router.get('/', requireMemberAccess, accessRequestController.listReceived);
router.get('/received', requireMemberAccess, accessRequestController.listReceived);
router.get('/sent', accessRequestController.listSent);
router.patch('/:id', accessRequestController.updateSent);
router.patch('/:id/status', accessRequestController.updateStatus);
router.post('/:id/paper', requireMemberAccess, upload.pdfUpload.single('paper'), accessRequestController.uploadPaper);

module.exports = router;
