const express = require('express');
const router = express.Router();

const FoodItem = require('../models/FoodItem');
const ClaimedItem = require('../models/ClaimedItem');
const Order = require('../models/Order');
const User = require('../models/User');
const Pincode = require('../models/Pincode');
const ContactMessage = require('../models/ContactMessage');
const faq = require('../data/faq');
const { requireUser } = require('../middleware/auth');
const { awardPoints, checkAndAwardPincode, POINTS } = require('../utils/points');
const { sendOrderPlacedEmailToBuyer, sendNewOrderEmailToOwner } = require('../utils/mailer');

// ---------------- STATIC / INFO PAGES ----------------
router.get(['/', '/index'], (req, res) => {
  res.render('index');
});

router.get('/about', (req, res) => {
  res.render('about');
});

router.get('/contact', (req, res) => {
  res.render('contact');
});

router.post('/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    await ContactMessage.create({ name, email, message });
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving contact message:', err);
    res.status(500).json({ success: false });
  }
});

router.get(['/leaderboard', '/ledarboard'], async (req, res) => {
  try {
    // Top contributors, ranked by their live points total. Points are
    // awarded in real time in utils/points.js whenever someone signs up,
    // lists food, introduces a new pincode, or gets an order confirmed —
    // so this list is always current, no batch job required.
    const topUsers = await User.find().sort({ points: -1 }).limit(15).select('name email points createdAt');

    // Regional leaderboard: how much listing activity each pincode has seen.
    const regionLeaderboard = await FoodItem.aggregate([
      {
        $group: {
          _id: '$pincode',
          totalListings: { $sum: 1 },
          totalQuantity: { $sum: '$originalQuantity' },
          contributors: { $addToSet: '$postedBy' }
        }
      },
      { $project: { totalListings: 1, totalQuantity: 1, contributorCount: { $size: '$contributors' } } },
      { $sort: { totalListings: -1, totalQuantity: -1 } },
      { $limit: 15 }
    ]);

    const totalUsers = await User.countDocuments();
    const totalListingsCount = await FoodItem.countDocuments();
    const totalRegions = await Pincode.countDocuments();
    const totalMealsAgg = await FoodItem.aggregate([{ $group: { _id: null, total: { $sum: '$originalQuantity' } } }]);
    const totalMeals = totalMealsAgg[0] ? totalMealsAgg[0].total : 0;
    const maxRegionQuantity = regionLeaderboard.length > 0 ? regionLeaderboard[0].totalQuantity : 0;

    res.render('leaderboard', {
      topUsers,
      regionLeaderboard,
      maxRegionQuantity,
      totalMeals,
      totalListingsCount,
      totalDonors: totalUsers,
      totalRegions
    });
  } catch (err) {
    console.error('Error building leaderboard:', err);
    res.status(500).send('Could not load leaderboard.');
  }
});

router.get('/receipt_template', (req, res) => {
  res.render('receipt_template', {
    name: 'Guest',
    final_price: 0,
    address: 'N/A',
    now: new Date()
  });
});

// ---------------- CHATBOT ----------------
router.get('/chat', (req, res) => {
  res.render('chat', { title: 'AI Chat Assistant | FoodMitra' });
});

router.post('/get', async (req, res) => {
  const rawInput = (req.body.message || '').trim();
  const userInput = rawInput.toLowerCase();

  try {
    // ---- Personalized answers for logged-in users ----
    if (req.session && req.session.userId) {
      const userId = req.session.userId;

      if (/\bmy points\b|\bmy score\b|\bleaderboard rank\b|\bhow many points\b/.test(userInput)) {
        const user = await User.findById(userId);
        const rank = user ? (await User.countDocuments({ points: { $gt: user.points } })) + 1 : null;
        return res.json({ reply: user ? `🏆 You have ${user.points} points, putting you around rank #${rank} on the leaderboard.` : "I couldn't find your account — try logging in again." });
      }

      if (/\bmy orders\b|\border status\b|\bmy purchases\b|\bwhat i ordered\b/.test(userInput)) {
        const orders = await Order.find({ buyer: userId }).sort({ createdAt: -1 }).limit(5);
        if (!orders.length) return res.json({ reply: "You haven't placed any orders yet. Browse Listings to find food near you!" });
        const lines = orders.map((o) => `• ${o.itemTitle} (x${o.quantity}) — ${o.status}`);
        return res.json({ reply: `📦 Your recent orders:\n${lines.join('\n')}` });
      }

      if (/\borders received\b|\bpending orders\b|\bwho ordered\b|\bconfirm.*order\b|\breject.*order\b/.test(userInput)) {
        const pending = await Order.countDocuments({ owner: userId, status: 'pending' });
        return res.json({ reply: pending > 0 ? `🔔 You have ${pending} pending order(s) waiting for Confirm/Reject on your Dashboard.` : "You have no pending orders on your listings right now." });
      }

      if (/\bmy listings\b|\bmy food\b|\bwhat i listed\b/.test(userInput)) {
        const count = await FoodItem.countDocuments({ postedBy: userId });
        return res.json({ reply: `🍱 You currently have ${count} active listing(s). Manage them from your Dashboard.` });
      }
    }

    // ---- Pincode lookups: "food in 110001" / "listings near 400001" ----
    const pincodeMatch = userInput.match(/\b(\d{6})\b/);
    if (pincodeMatch && /\bfood\b|\blisting\b|\bnear\b|\bavailable\b|\bpincode\b/.test(userInput)) {
      const pincode = pincodeMatch[1];
      const count = await FoodItem.countDocuments({ pincode, quantity: { $gt: 0 } });
      return res.json({
        reply: count > 0
          ? `📍 There are ${count} available listing(s) in pincode ${pincode}. Check Browse Listings and search that pincode!`
          : `📍 No available listings in pincode ${pincode} right now. Try browsing all listings, or list surplus food there yourself!`
      });
    }

    // ---- Login / signup help ----
    if (/\blogin\b|\bsign in\b|\bsignup\b|\bsign up\b|\bregister\b|\baccount\b/.test(userInput) && !/\bmy account\b/.test(userInput)) {
      return res.json({ reply: "🔐 FoodMitra login is passwordless — enter your email to get a one-time code (OTP), or use 'Continue with Google'. Head to the Login page from the top menu." });
    }
    if (/\botp\b/.test(userInput)) {
      return res.json({ reply: "We email you a 6-digit code that expires in 5 minutes. Enter it on the verification page to log in — no password needed." });
    }
    if (/\bgoogle\b/.test(userInput)) {
      return res.json({ reply: "You can log in instantly with 'Continue with Google' on the Login page — no OTP needed for that option." });
    }

    // ---- Order workflow help ----
    if (/\border\b/.test(userInput) && /\bhow\b/.test(userInput)) {
      return res.json({ reply: "To order food: browse Listings, pick an item, and submit the order form. The person who listed it will Confirm or Reject it, and you'll see the status update on your Dashboard." });
    }
    if (/\bfree\b.*\bpaid\b|\bpaid\b.*\bfree\b|\bprice\b|\brate\b/.test(userInput)) {
      return res.json({ reply: "When you list food, you can mark it Free or Paid. Paid listings let you set a per-unit price that buyers see before ordering." });
    }

    // ---- Fallback: substring-matched FAQ (was exact-match only before) ----
    const faqKeys = Object.keys(faq);
    const matchedKey = faqKeys.find((key) => userInput.includes(key) || key.includes(userInput));
    const reply = matchedKey
      ? faq[matchedKey]
      : "🤖 Sorry, I didn't quite catch that. Try asking about donating, listing food, orders, OTP/Google login, the leaderboard, or pincodes.";

    res.json({ reply });
  } catch (err) {
    console.error('Chat assistant error:', err);
    res.json({ reply: "⚠️ Something went wrong on my end — please try again in a moment." });
  }
});

// ---------------- CLAIM (discounted items) ----------------
router.get('/claim', (req, res) => {
  const name = req.query.name || 'Item';
  const price = parseInt(req.query.price, 10) || 100;
  const discount = parseInt(req.query.discount, 10) || 10;
  res.render('claim', { name, price, discount });
});

router.post('/confirm', async (req, res) => {
  try {
    const name = req.body.name;
    const price = parseInt(req.body.price, 10);
    const discount = parseInt(req.body.discount, 10);
    const address = req.body.address;
    const finalPrice = price - Math.floor((price * discount) / 100);

    await ClaimedItem.create({ name, price, discount, finalPrice, address });

    res.render('thank_you', { claim: { name, finalPrice, address } });
  } catch (err) {
    console.error('Error saving claim:', err);
    res.status(500).send('Something went wrong while confirming your claim. Please try again.');
  }
});


// ---------------- UPLOAD (legacy path — consolidated into Add Food Item) ----------------
// Old bookmarks/links to /upload now just land on the one real "Add Food
// Item" flow in the dashboard, which also collects phone/location/category/address.
router.all(['/upload'], requireUser, (req, res) => {
  res.redirect('/account/items/new');
});

router.get('/listings', async (req, res) => {
  try {
    const pincode = (req.query.pincode || '').trim();
    const filter = pincode ? { pincode } : {};

    const foodItems = await FoodItem.find(filter).sort({ postedAt: -1 });
    res.render('listings', { foodItems, pincode });
  } catch (err) {
    console.error('Error fetching listings:', err);
    res.status(500).send('Could not load listings.');
  }
});

// Ordering requires login — the order needs a real buyer account both to
// notify the listing owner and to show up on the buyer's own dashboard.
router.get('/reserve/:id', requireUser, async (req, res) => {
  try {
    const item = await FoodItem.findById(req.params.id);
    if (!item) return res.redirect('/listings');
    if (item.quantity <= 0) {
      return res.redirect('/listings?sold_out=1');
    }
    if (item.postedBy && item.postedBy.toString() === req.session.userId) {
      return res.render('reserve', { item, error: "You can't order your own listing." });
    }
    res.render('reserve', { item, error: null });
  } catch (err) {
    console.error('Error loading order form:', err);
    res.redirect('/listings');
  }
});

router.post('/reserve/:id', requireUser, async (req, res) => {
  try {
    const { name, contact, address, quantity } = req.body;
    const qty = parseInt(quantity, 10);

    const item = await FoodItem.findById(req.params.id);
    if (!item) return res.redirect('/listings');

    if (!name || !contact || !address || !quantity) {
      return res.render('reserve', { item, error: 'Please fill in all fields.' });
    }
    if (isNaN(qty) || qty < 1) {
      return res.render('reserve', { item, error: 'Please enter a valid quantity.' });
    }
    if (qty > item.quantity) {
      return res.render('reserve', { item, error: `Only ${item.quantity} left — please choose a smaller quantity.` });
    }
    if (!item.postedBy) {
      return res.render('reserve', { item, error: 'This listing has no owner on record and cannot be ordered.' });
    }
    if (item.postedBy.toString() === req.session.userId) {
      return res.render('reserve', { item, error: "You can't order your own listing." });
    }

    // Stock is NOT decremented here anymore — it only moves once the listing
    // owner hits Confirm on their Dashboard (see routes/account.js). This is
    // what makes the Confirm/Reject workflow meaningful: the owner decides.
    const order = await Order.create({
      foodItem: item._id,
      itemTitle: item.title,
      listingType: item.listingType,
      price: item.price,
      quantity: qty,
      buyer: req.session.userId,
      buyerName: name.trim(),
      buyerContact: contact.trim(),
      buyerAddress: address.trim(),
      owner: item.postedBy,
      pincode: item.pincode
    });

    // Notify both sides right away — best-effort, never blocks the response.
    const [buyerUser, ownerUser] = await Promise.all([
      User.findById(req.session.userId),
      User.findById(item.postedBy)
    ]);
    if (buyerUser && buyerUser.email) sendOrderPlacedEmailToBuyer(buyerUser.email, order.buyerName, order, item);
    if (ownerUser && ownerUser.email) sendNewOrderEmailToOwner(ownerUser.email, ownerUser.name, order);

    res.render('reserve', { item, error: null, success: true, reservedQty: qty, name: name.trim(), order });
  } catch (err) {
    console.error('Error placing order:', err);
    res.redirect('/listings');
  }
});

module.exports = router;
