const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const aiImageService = require('../services/aiImageService');

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 1. Check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ error: 'Username taken' });

    // 2. Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Handle PFP Upload (if file exists via multer)
    let pfpUrl = '';
    let cardFaces = {};
    
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI, { 
        folder: 'spades_pfps', crop: "fill", gravity: "face", width: 300, height: 300 
      });
      pfpUrl = result.secure_url;

      // 4. Trigger AI Generation pipeline
      cardFaces = await aiImageService.generateRoyalCards(req.file.buffer ,username ,pfpUrl);
    }

    // 5. Save User
    const newUser = new User({ username, password: hashedPassword, pfp: pfpUrl, cardFaces });
    await newUser.save();

    res.status(201).json({ message: 'Registration successful. Please log in.' });
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    // Generate JWT Token
    const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Send user data back (excluding password)
    res.json({ 
      token, 
      user: { id: user._id, username: user.username, pfp: user.pfp, cardFaces: user.cardFaces } 
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
};
exports.updateProfileImage = async (req, res) => {
  try {
    const { username } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    // Upload new image to Cloudinary
    const b64 = Buffer.from(req.file.buffer).toString('base64');
    const dataURI = `data:${req.file.mimetype};base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataURI, { 
      folder: 'spades_pfps', crop: "fill", gravity: "face", width: 300, height: 300 
    });

    const pfpUrl = result.secure_url;

    // Trigger AI Generation for the new face
    const cardFaces = await aiImageService.generateRoyalCards(req.file.buffer, username, pfpUrl);

    // Save to DB
    user.pfp = pfpUrl;
    user.cardFaces = cardFaces;
    await user.save();

    // Return the updated user object
    res.json({ 
      user: { id: user._id, username: user.username, pfp: user.pfp, cardFaces: user.cardFaces } 
    });
  } catch (error) {
    console.error("Update PFP Error:", error);
    res.status(500).json({ error: 'Failed to update profile picture' });
  }
};