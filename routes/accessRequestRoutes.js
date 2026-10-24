const express = require('express');
const { authenticate } = require('../middleware/auth');
const accessRequestController = require('../controllers/accessRequestController');

const router = express.Router();
router.use(authenticate);
router.post('/', accessRequestController.create);
router.get('/', accessRequestController.listReceived);
router.get('/received', accessRequestController.listReceived);
router.get('/sent', accessRequestController.listSent);
router.patch('/:id', accessRequestController.updateSent);
router.patch('/:id/status', accessRequestController.updateStatus);

module.exports = router;
