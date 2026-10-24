const express = require('express');
const memberController = require('../controllers/memberController');

const router = express.Router();

router.get('/', memberController.list);

module.exports = router;
