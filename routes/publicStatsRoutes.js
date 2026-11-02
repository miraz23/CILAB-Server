const express = require('express');
const publicStatsController = require('../controllers/publicStatsController');

const router = express.Router();

router.get('/', publicStatsController.get);

module.exports = router;
