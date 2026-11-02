const express = require('express');
const researchController = require('../controllers/researchController');

const router = express.Router();

router.get('/', researchController.list);
router.get('/:id/pdf', researchController.downloadPaper);
router.get('/:id/preview', researchController.previewPaper);

module.exports = router;
