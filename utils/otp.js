const crypto = require('crypto');

// 6-digit numeric code, e.g. "042817"
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// We only ever store this hash, never the plaintext code, so a database
// leak alone can't be used to log in as someone.
function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

module.exports = { generateOtp, hashOtp };
