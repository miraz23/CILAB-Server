const express = require('express');
const scheduleController = require('../controllers/scheduleController');

const router = express.Router();

router.get('/', scheduleController.list);

module.exports = router;
