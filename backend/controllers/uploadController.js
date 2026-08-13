const cloudinary = require('cloudinary').v2;

// Configure Cloudinary using your .env secrets
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

exports.uploadFace = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Convert Multer's memory buffer into a format Cloudinary can read
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;

    // Upload to Cloudinary securely
    const result = await cloudinary.uploader.upload(dataURI, { 
      folder: 'spades_faces',
      width: 150, // Compress and crop so the images load super fast
      height: 150,
      crop: "fill",
      gravity: "face" // Auto-centers on the selfie face!
    });

    res.json({ secure_url: result.secure_url });
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    res.status(500).json({ error: 'Upload failed' });
  }
};