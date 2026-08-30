// ---------------------------------------------------------------------------
// Public REST API (JSON) — GET /api/v1/*
//
// A small, read-only REST layer over the same data the EJS views render.
// Every response follows the same envelope: { success, data } or
// { success: false, error }. Nothing here requires authentication; it only
// exposes information that is already public on the website (listings,
// leaderboard, basic stats).
// ---------------------------------------------------------------------------

const express = require('express');
const router = express.Router();

const FoodItem = require('../models/FoodItem');
const User = require('../models/User');
const Pincode = require('../models/Pincode');

// GET /api/v1 — index of available endpoints
router.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'FoodMitra API',
    version: 'v1',
    endpoints: [
      'GET /api/v1/listings',
      'GET /api/v1/listings/:id',
      'GET /api/v1/leaderboard',
      'GET /api/v1/stats'
    ]
  });
});

// GET /api/v1/listings — active food listings, optionally filtered by pincode/category
router.get('/listings', async (req, res) => {
  try {
    const filter = {};
    if (req.query.pincode) filter.pincode = req.query.pincode.trim();

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const listings = await FoodItem.find(filter)
      .sort({ postedAt: -1 })
      .limit(limit)
      .select('title description pincode listingType price quantity originalQuantity postedByName postedAt');

    res.json({ success: true, count: listings.length, data: listings });
  } catch (err) {
    console.error('GET /api/v1/listings error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch listings.' });
  }
});

// GET /api/v1/listings/:id — single listing by id
router.get('/listings/:id', async (req, res) => {
  try {
    const listing = await FoodItem.findById(req.params.id)
      .select('title description pincode listingType price quantity originalQuantity postedByName postedAt');

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found.' });
    }
    res.json({ success: true, data: listing });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Invalid listing id.' });
  }
});

// GET /api/v1/leaderboard — top contributors by points
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 50);
    const topUsers = await User.find().sort({ points: -1 }).limit(limit).select('name points');
    res.json({ success: true, count: topUsers.length, data: topUsers });
  } catch (err) {
    console.error('GET /api/v1/leaderboard error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch leaderboard.' });
  }
});

// GET /api/v1/stats — quick platform-wide counters
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalListings, totalRegions, mealsAgg] = await Promise.all([
      User.countDocuments(),
      FoodItem.countDocuments(),
      Pincode.countDocuments(),
      FoodItem.aggregate([{ $group: { _id: null, total: { $sum: '$originalQuantity' } } }])
    ]);

    res.json({
      success: true,
      data: {
        totalDonors: totalUsers,
        totalListings,
        totalRegions,
        totalMeals: mealsAgg[0] ? mealsAgg[0].total : 0
      }
    });
  } catch (err) {
    console.error('GET /api/v1/stats error:', err);
    res.status(500).json({ success: false, error: 'Could not fetch stats.' });
  }
});

module.exports = router;
