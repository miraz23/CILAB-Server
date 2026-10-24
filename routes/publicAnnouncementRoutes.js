const express = require('express');
const announcementController = require('../controllers/announcementController');

const router = express.Router();

router.get('/', announcementController.publicList);

module.exports = router;
