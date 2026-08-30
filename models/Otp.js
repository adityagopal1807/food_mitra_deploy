const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },

  // SHA-256 hash of the 6-digit code — the plaintext code is never stored.
  otpHash: { type: String, required: true },

  // Captured at request time so we know what to name a brand-new account
  // once the code is verified (existing users keep their saved name).
  name: { type: String, default: null },

  attempts: { type: Number, default: 0 },

  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

// TTL index — MongoDB automatically deletes the document once expiresAt passes.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
