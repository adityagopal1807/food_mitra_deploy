const mongoose = require('mongoose');

const claimedItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  discount: { type: Number, required: true },
  finalPrice: { type: Number, required: true },
  address: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ClaimedItem', claimedItemSchema);
