const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/register', upload.single('pfp'), authController.register);
router.post('/login', authController.login);
// Add this below your login/register routes
router.post('/update-pfp', upload.single('pfp'), authController.updateProfileImage);

module.exports = router;