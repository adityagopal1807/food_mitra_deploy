const express = require('express');
const router = express.Router();

const User = require('../models/User');
const FoodItem = require('../models/FoodItem');
const Order = require('../models/Order');
const upload = require('../config/upload');
const { requireUser } = require('../middleware/auth');
const { awardPoints, checkAndAwardPincode, POINTS } = require('../utils/points');
const {
  sendListingPostedEmail,
  sendOrderStatusEmailToBuyer,
  sendOrderStatusEmailToOwner
} = require('../utils/mailer');

router.use(requireUser);

// upload.single('image') runs as its own middleware step, outside any
// route handler's try/catch. If Cloudinary rejects the upload (bad
// credentials, network hiccup, oversized file, etc.) that error would
// otherwise skip straight past our handlers to the global 500 page. This
// wrapper catches it here instead so we can show a real, useful message.
function handleImageUpload(req, res, next) {
  upload.single('image')(req, res, function (err) {
    if (err) {
      console.error('Image upload error:', err);
      const message = err.http_code
        ? `Image upload failed: ${err.message} (Cloudinary error ${err.http_code}). Double-check your CLOUDINARY_* environment variables.`
        : `Image upload failed: ${err.message}`;
      return res.status(400).render('account/item_form', {
        error: message,
        formData: req.body,
        item: null
      });
    }
    next();
  });
}

// ---------------- DASHBOARD ----------------
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await User.findById(userId);

    const items = await FoodItem.find({ postedBy: userId }).sort({ postedAt: -1 });
    const totalListings = items.length;
    const totalQuantityAvailable = items.reduce((sum, it) => sum + it.quantity, 0);
    const soldOutCount = items.filter((it) => it.quantity <= 0).length;

    // Orders other people have placed on MY listings — these need Confirm/Reject.
    const ordersReceived = await Order.find({ owner: userId }).sort({ createdAt: -1 });

    // Orders I have placed on other people's listings.
    const ordersPlaced = await Order.find({ buyer: userId }).sort({ createdAt: -1 });

    res.render('account/dashboard', {
      user,
      items,
      totalListings,
      totalQuantityAvailable,
      soldOutCount,
      ordersReceived,
      ordersPlaced,
      notice: req.query.notice || null
    });
  } catch (err) {
    console.error('Account dashboard error:', err);
    res.status(500).send('Could not load your dashboard.');
  }
});

// ---------------- ADD FOOD ITEM ----------------
router.get('/items/new', (req, res) => {
  res.render('account/item_form', { error: null, formData: {}, item: null });
});

router.post('/items', handleImageUpload, async (req, res) => {
  try {
    const { title, description, expiry, pincode, quantity, listingType, price, phone, location, category, address } = req.body;
    const qty = parseInt(quantity, 10);
    const isPaid = listingType === 'paid';
    const unitPrice = isPaid ? parseFloat(price) : 0;

    if (!title || !description || !expiry || !pincode || !quantity || !phone || !location || !category || !address) {
      return res.render('account/item_form', { error: 'All fields are required.', formData: req.body, item: null });
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      return res.render('account/item_form', { error: 'Pincode must be a valid 6-digit number.', formData: req.body, item: null });
    }
    if (!/^\d{10}$/.test(phone.trim())) {
      return res.render('account/item_form', { error: 'Phone number must be a valid 10-digit number.', formData: req.body, item: null });
    }
    if (!['human', 'animals'].includes(category)) {
      return res.render('account/item_form', { error: 'Please select a valid category.', formData: req.body, item: null });
    }
    if (isNaN(qty) || qty < 1) {
      return res.render('account/item_form', { error: 'Quantity must be at least 1.', formData: req.body, item: null });
    }
    if (isPaid && (isNaN(unitPrice) || unitPrice <= 0)) {
      return res.render('account/item_form', { error: 'Please enter a valid price for a paid listing.', formData: req.body, item: null });
    }
    if (!req.file) {
      return res.render('account/item_form', { error: 'A photo of the food item is required.', formData: req.body, item: null });
    }

    const user = await User.findById(req.session.userId);
    const cleanPincode = pincode.trim();

    const newItem = await FoodItem.create({
      title: title.trim(),
      description: description.trim(),
      expiry,
      pincode: cleanPincode,
      phone: phone.trim(),
      location: location.trim(),
      category,
      address: address.trim(),
      listingType: isPaid ? 'paid' : 'free',
      price: isPaid ? unitPrice : 0,
      quantity: qty,
      originalQuantity: qty,
      image: req.file.path, // full Cloudinary URL
      postedBy: req.session.userId,
      postedByName: user ? user.name : 'FoodMitra User'
    });

    // Leaderboard: listing food always earns points; a brand-new pincode earns extra.
    await awardPoints(req.session.userId, POINTS.LISTING);
    await checkAndAwardPincode(cleanPincode, req.session.userId);

    // Let the lister know their listing went live — best-effort, never blocks the redirect.
    if (user && user.email) {
      sendListingPostedEmail(user.email, user.name, newItem);
    }

    res.redirect('/account/dashboard?notice=listing_added');
  } catch (err) {
    console.error('Add food item error:', err);
    res.render('account/item_form', { error: 'Something went wrong while saving. Please try again.', formData: req.body, item: null });
  }
});

// ---------------- EDIT FOOD ITEM ----------------
router.get('/items/:id/edit', async (req, res) => {
  try {
    const item = await FoodItem.findOne({ _id: req.params.id, postedBy: req.session.userId });
    if (!item) return res.redirect('/account/dashboard');
    res.render('account/item_form', { error: null, formData: null, item });
  } catch (err) {
    console.error('Edit item load error:', err);
    res.redirect('/account/dashboard');
  }
});

router.post('/items/:id/edit', async (req, res, next) => {
  // Look the item up first so an upload failure below can still re-render
  // the edit form with the item's existing data instead of a blank one.
  const existingItem = await FoodItem.findOne({ _id: req.params.id, postedBy: req.session.userId }).catch(() => null);
  if (!existingItem) return res.redirect('/account/dashboard');

  upload.single('image')(req, res, function (err) {
    if (err) {
      console.error('Image upload error (edit):', err);
      const message = err.http_code
        ? `Image upload failed: ${err.message} (Cloudinary error ${err.http_code}). Double-check your CLOUDINARY_* environment variables.`
        : `Image upload failed: ${err.message}`;
      return res.status(400).render('account/item_form', {
        error: message,
        formData: req.body,
        item: existingItem
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const item = await FoodItem.findOne({ _id: req.params.id, postedBy: req.session.userId });
    if (!item) return res.redirect('/account/dashboard');

    const { title, description, expiry, pincode, quantity, listingType, price, phone, location, category, address } = req.body;
    const qty = parseInt(quantity, 10);
    const isPaid = listingType === 'paid';
    const unitPrice = isPaid ? parseFloat(price) : 0;

    if (!title || !description || !expiry || !pincode || quantity === undefined || quantity === '' || !phone || !location || !category || !address) {
      return res.render('account/item_form', { error: 'All fields are required.', formData: req.body, item });
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      return res.render('account/item_form', { error: 'Pincode must be a valid 6-digit number.', formData: req.body, item });
    }
    if (!/^\d{10}$/.test(phone.trim())) {
      return res.render('account/item_form', { error: 'Phone number must be a valid 10-digit number.', formData: req.body, item });
    }
    if (!['human', 'animals'].includes(category)) {
      return res.render('account/item_form', { error: 'Please select a valid category.', formData: req.body, item });
    }
    if (isNaN(qty) || qty < 0) {
      return res.render('account/item_form', { error: 'Quantity cannot be negative.', formData: req.body, item });
    }
    if (isPaid && (isNaN(unitPrice) || unitPrice <= 0)) {
      return res.render('account/item_form', { error: 'Please enter a valid price for a paid listing.', formData: req.body, item });
    }

    item.title = title.trim();
    item.description = description.trim();
    item.expiry = expiry;
    const cleanPincode = pincode.trim();
    item.pincode = cleanPincode;
    item.phone = phone.trim();
    item.location = location.trim();
    item.category = category;
    item.address = address.trim();
    item.listingType = isPaid ? 'paid' : 'free';
    item.price = isPaid ? unitPrice : 0;

    // If the owner raises the total on hand, bump both counters so the
    // "X of Y left" display stays meaningful; if they only correct the
    // remaining count, originalQuantity stays put.
    if (qty > item.originalQuantity) {
      item.originalQuantity = qty;
    }
    item.quantity = qty;

    if (req.file) {
      item.image = req.file.path; // full Cloudinary URL
    }

    await item.save();
    await checkAndAwardPincode(cleanPincode, req.session.userId);
    res.redirect('/account/dashboard');
  } catch (err) {
    console.error('Edit item save error:', err);
    res.redirect('/account/dashboard');
  }
});

// ---------------- DELETE FOOD ITEM ----------------
router.post('/items/:id/delete', async (req, res) => {
  try {
    await FoodItem.deleteOne({ _id: req.params.id, postedBy: req.session.userId });
    res.redirect('/account/dashboard');
  } catch (err) {
    console.error('Delete item error:', err);
    res.redirect('/account/dashboard');
  }
});

// ---------------- CONFIRM / REJECT ORDERS RECEIVED ----------------
router.post('/orders/:id/confirm', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, owner: req.session.userId, status: 'pending' });
    if (!order) return res.redirect('/account/dashboard?notice=order_not_found');

    // Atomic decrement: only succeeds if enough stock is still available at
    // the moment of confirmation, so an owner can never confirm more than
    // what's actually left (e.g. if other orders were confirmed first).
    const updatedItem = await FoodItem.findOneAndUpdate(
      { _id: order.foodItem, quantity: { $gte: order.quantity } },
      { $inc: { quantity: -order.quantity } },
      { new: true }
    );

    if (!updatedItem) {
      order.status = 'rejected';
      order.updatedAt = new Date();
      await order.save();

      const [buyer, owner] = await Promise.all([
        User.findById(order.buyer),
        User.findById(order.owner)
      ]);
      if (buyer && buyer.email) sendOrderStatusEmailToBuyer(buyer.email, order.buyerName, order, 'rejected');
      if (owner && owner.email) sendOrderStatusEmailToOwner(owner.email, owner.name, order, 'rejected');

      return res.redirect('/account/dashboard?notice=insufficient_stock');
    }

    order.status = 'confirmed';
    order.updatedAt = new Date();
    await order.save();

    await awardPoints(req.session.userId, POINTS.ORDER_CONFIRMED);

    const [buyer, owner] = await Promise.all([
      User.findById(order.buyer),
      User.findById(order.owner)
    ]);
    if (buyer && buyer.email) sendOrderStatusEmailToBuyer(buyer.email, order.buyerName, order, 'confirmed');
    if (owner && owner.email) sendOrderStatusEmailToOwner(owner.email, owner.name, order, 'confirmed');

    res.redirect('/account/dashboard?notice=order_confirmed');
  } catch (err) {
    console.error('Confirm order error:', err);
    res.redirect('/account/dashboard');
  }
});

router.post('/orders/:id/reject', async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, owner: req.session.userId, status: 'pending' });
    if (!order) return res.redirect('/account/dashboard?notice=order_not_found');

    order.status = 'rejected';
    order.updatedAt = new Date();
    await order.save();

    const [buyer, owner] = await Promise.all([
      User.findById(order.buyer),
      User.findById(order.owner)
    ]);
    if (buyer && buyer.email) sendOrderStatusEmailToBuyer(buyer.email, order.buyerName, order, 'rejected');
    if (owner && owner.email) sendOrderStatusEmailToOwner(owner.email, owner.name, order, 'rejected');

    res.redirect('/account/dashboard?notice=order_rejected');
  } catch (err) {
    console.error('Reject order error:', err);
    res.redirect('/account/dashboard');
  }
});

module.exports = router;
