const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  pfp: { type: String }, // Original selfie from Cloudinary
  cardFaces: {
    11: { type: String }, // Jack
    12: { type: String }, // Queen
    13: { type: String }, // King
    14: { type: String }  // Ace
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);