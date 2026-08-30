const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },

  // Set when the account was created/linked via "Continue with Google".
  // Null for accounts that only ever used email OTP.
  googleId: { type: String, default: null, index: true, sparse: true },
  avatar: { type: String, default: null },

  // Leaderboard score. Incremented by utils/points.js whenever the user
  // signs up, lists food, introduces a new pincode, or has an order confirmed.
  points: { type: Number, default: 0, index: true },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
