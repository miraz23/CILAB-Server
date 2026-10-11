const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);
router.get('/users', adminController.listUsers);
router.patch('/users/:id/access', adminController.updateAccess);

module.exports = router;
