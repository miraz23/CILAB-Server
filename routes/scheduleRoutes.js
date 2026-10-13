const express = require('express');
const scheduleController = require('../controllers/scheduleController');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);
router.get('/', scheduleController.list);
router.post('/', scheduleController.create);
router.patch('/:id', scheduleController.update);
router.delete('/:id', scheduleController.remove);

module.exports = router;
