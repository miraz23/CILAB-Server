const express = require('express');
const authController = require('../controllers/authController');
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/users', authenticate, userController.listCollaborators);
router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);

module.exports = router;
