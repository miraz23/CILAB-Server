const express = require('express');
const announcementController = require('../controllers/announcementController');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);
router.get('/', announcementController.list);
router.post('/', announcementController.upsert);
router.patch('/:id', announcementController.upsert);
router.delete('/:id', announcementController.remove);

module.exports = router;
