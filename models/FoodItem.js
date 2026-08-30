const mongoose = require('mongoose');

const foodItemSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  expiry: { type: String, required: true },
  image: { type: String, required: true },

  // Where the food is available for pickup — used for filtering
  pincode: { type: String, required: true, trim: true, index: true },

  // Full pickup/collection address shown to interested buyers.
  address: { type: String, required: true, trim: true },

  // Short area / locality name for display (e.g. "Connaught Place, Delhi").
  location: { type: String, required: true, trim: true },

  // Who to call about this listing.
  phone: { type: String, required: true, trim: true },

  // Who this food is meant for — mirrors the old Donation model's category.
  category: { type: String, enum: ['human', 'animals'], default: 'human' },

  // Free listings have price 0; paid listings carry a per-unit price set by
  // whoever posted the listing.
  listingType: { type: String, enum: ['free', 'paid'], default: 'free' },
  price: { type: Number, default: 0, min: 0 },

  // How many units are still up for grabs. This is the single source of
  // truth for availability — nothing about "reserved" is stored separately,
  // it is always derived from this number so it can never drift out of sync.
  quantity: { type: Number, required: true, min: 0, default: 1 },

  // How many units this listing started with (kept so the UI can show
  // "3 of 5 left" instead of just the remaining count)
  originalQuantity: { type: Number, required: true, min: 0, default: 1 },

  // Who posted it — the logged-in User who created this listing.
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  postedByName: { type: String, default: 'Community Member' },

  postedAt: { type: Date, default: Date.now }
});

// Convenience virtual so views can just check item.isAvailable
foodItemSchema.virtual('isAvailable').get(function () {
  return this.quantity > 0;
});
foodItemSchema.set('toObject', { virtuals: true });
foodItemSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('FoodItem', foodItemSchema);
