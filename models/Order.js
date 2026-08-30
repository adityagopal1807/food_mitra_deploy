const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  foodItem: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem', required: true },
  itemTitle: { type: String, required: true }, // snapshot so history reads fine even if the item is later deleted

  listingType: { type: String, enum: ['free', 'paid'], default: 'free' },
  price: { type: Number, default: 0 }, // per-unit price at the time of order, snapshotted

  quantity: { type: Number, required: true, min: 1 },

  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  buyerName: { type: String, required: true },
  buyerContact: { type: String, required: true },
  buyerAddress: { type: String, required: true },

  // The user who posted the listing — the one who sees Confirm/Reject.
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  pincode: { type: String, required: true },

  // pending -> confirmed (stock is decremented + owner gets points)
  //         -> rejected (stock untouched)
  status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending', index: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
