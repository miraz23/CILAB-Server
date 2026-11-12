const express = require('express');
const controller = require('../controllers/memberRequestController');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/status', controller.getStatus);
router.post('/', controller.create);
router.get('/admin', requireAdmin, controller.listPending);
router.patch('/admin/:id', requireAdmin, controller.decide);

module.exports = router;
