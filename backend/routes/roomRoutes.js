const express = require('express');
const router = express.Router();
const multer = require('multer');

const roomController = require('../controllers/roomController');
const uploadController = require('../controllers/uploadController');

// Keep images in RAM temporarily before sending to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/rooms', roomController.getPublicRooms);

// NEW UPLOAD ROUTE
router.post('/upload-face', upload.single('file'), uploadController.uploadFace);

module.exports = router;