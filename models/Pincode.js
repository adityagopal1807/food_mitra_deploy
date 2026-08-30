const mongoose = require('mongoose');

// One document per distinct pincode ever seen on the platform. The unique
// index on `code` is what lets utils/points.js safely award "new pincode"
// points exactly once, even under concurrent requests (see checkAndAwardPincode).
const pincodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true },
  firstUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Pincode', pincodeSchema);
