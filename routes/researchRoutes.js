const express = require('express');
const researchController = require('../controllers/researchController');

const router = express.Router();

router.get('/', researchController.list);

module.exports = router;
