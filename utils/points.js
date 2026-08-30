const User = require('../models/User');
const Pincode = require('../models/Pincode');

// Central place for every leaderboard scoring rule so the numbers are easy
// to tune without hunting through route files.
const POINTS = {
  SIGNUP: 5,            // creating an account (OTP or Google, first time only)
  LISTING: 10,          // posting a food listing (donate or upload)
  NEW_PINCODE: 20,      // being the first person ever to list food from a given pincode
  ORDER_CONFIRMED: 15   // a listing owner confirms an order on their listing
};

/**
 * Add `amount` points to a user's leaderboard score.
 * Safe to call even if amount is 0/negative — it just won't move the needle.
 */
async function awardPoints(userId, amount) {
  if (!userId || !amount) return;
  await User.findByIdAndUpdate(userId, { $inc: { points: amount } });
}

/**
 * Checks whether `pincode` has ever been seen before. If it's brand new,
 * records it and awards NEW_PINCODE points to `userId`. If it already
 * exists, does nothing — so the same pincode never earns points twice.
 *
 * Uses Pincode's unique index on `code` + a create() call (rather than
 * find-then-create) so this is safe even if two requests for the same new
 * pincode land at the same instant — only one of them will succeed.
 *
 * Returns true if this pincode was newly awarded, false if it already existed.
 */
async function checkAndAwardPincode(pincode, userId) {
  if (!pincode) return false;
  try {
    await Pincode.create({ code: pincode, firstUser: userId || null });
    await awardPoints(userId, POINTS.NEW_PINCODE);
    return true;
  } catch (err) {
    // Duplicate key error (11000) just means this pincode already exists —
    // that's the expected, common case, not a real error.
    if (err && err.code === 11000) return false;
    throw err;
  }
}

module.exports = { POINTS, awardPoints, checkAndAwardPincode };
