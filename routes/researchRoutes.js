const express = require('express');
const researchController = require('../controllers/researchController');

const router = express.Router();

router.get('/', researchController.list);
router.get('/search', researchController.search);
router.get('/:id/pdf', researchController.downloadPaper);
router.get('/:id/preview', researchController.previewPaper);
router.get('/:id/presentation', researchController.downloadPresentation);
router.get('/:id/presentation/preview', researchController.previewPresentation);

module.exports = router;
