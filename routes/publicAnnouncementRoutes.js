const express = require('express');
const announcementController = require('../controllers/announcementController');

const router = express.Router();

router.get('/', announcementController.publicList);
router.get('/:id/preview', announcementController.previewPoster);

module.exports = router;
