const express = require('express');
const passport = require('passport');
const router = express.Router();

const User = require('../models/User');
const Otp = require('../models/Otp');
const { generateOtp, hashOtp } = require('../utils/otp');
const { sendOtpEmail } = require('../utils/mailer');
const { awardPoints, POINTS } = require('../utils/points');
const { redirectIfUser } = require('../middleware/auth');

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;

function finishLogin(req, res, user) {
  req.session.userId = user._id.toString();
  req.session.userName = user.name;
  const redirectTo = req.session.returnTo || '/account/dashboard';
  delete req.session.returnTo;
  res.redirect(redirectTo);
}

// ---------------- LOGIN PAGE ----------------
router.get('/login', redirectIfUser, (req, res) => {
  res.render('auth/login', {
    error: null,
    info: null,
    googleEnabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  });
});

// ---------------- STEP 1: REQUEST OTP ----------------
router.post('/otp/request', redirectIfUser, async (req, res) => {
  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  try {
    const { name, email } = req.body;
    if (!email || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.render('auth/login', { error: 'Please enter a valid email address.', info: null, googleEnabled });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: cleanEmail });

    // For brand-new emails we need a display name; existing users keep theirs.
    if (!existingUser && (!name || !name.trim())) {
      return res.render('auth/login', {
        error: "We haven't seen this email before — please also enter your name so we can create your account.",
        info: null,
        googleEnabled
      });
    }

    const otp = generateOtp();
    await Otp.deleteMany({ email: cleanEmail }); // invalidate any earlier codes
    await Otp.create({
      email: cleanEmail,
      otpHash: hashOtp(otp),
      name: existingUser ? null : name.trim(),
      expiresAt: new Date(Date.now() + OTP_TTL_MS)
    });

    await sendOtpEmail(cleanEmail, otp);

    res.render('auth/verify', { email: cleanEmail, error: null });
  } catch (err) {
    console.error('OTP request error:', err);
    res.render('auth/login', {
      error: 'Could not send the login code right now. Please try again in a moment.',
      info: null,
      googleEnabled
    });
  }
});

// ---------------- STEP 2: VERIFY OTP ----------------
router.post('/otp/verify', redirectIfUser, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !otp) {
      return res.render('auth/verify', { email: cleanEmail, error: 'Please enter the 6-digit code.' });
    }

    const record = await Otp.findOne({ email: cleanEmail }).sort({ createdAt: -1 });
    if (!record) {
      return res.render('auth/verify', { email: cleanEmail, error: 'This code has expired. Please request a new one.' });
    }

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      await Otp.deleteMany({ email: cleanEmail });
      return res.render('auth/verify', { email: cleanEmail, error: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (record.otpHash !== hashOtp(otp.trim())) {
      record.attempts += 1;
      await record.save();
      return res.render('auth/verify', { email: cleanEmail, error: 'Incorrect code. Please try again.' });
    }

    // Correct code — consume it so it can't be reused.
    await Otp.deleteMany({ email: cleanEmail });

    let user = await User.findOne({ email: cleanEmail });
    let isNewUser = false;
    if (!user) {
      user = await User.create({ name: record.name || cleanEmail.split('@')[0], email: cleanEmail });
      isNewUser = true;
    }
    if (isNewUser) {
      await awardPoints(user._id, POINTS.SIGNUP);
    }

    finishLogin(req, res, user);
  } catch (err) {
    console.error('OTP verify error:', err);
    res.render('auth/verify', { email: (req.body && req.body.email) || '', error: 'Something went wrong. Please try again.' });
  }
});

// ---------------- GOOGLE OAUTH ----------------
router.get('/google', redirectIfUser, (req, res, next) => {
  if (!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)) {
    return res.render('auth/login', {
      error: 'Google login is not configured yet. Please use email OTP instead.',
      info: null,
      googleEnabled: false
    });
  }
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false, failureRedirect: '/auth/login' }, (err, user) => {
    if (err || !user) {
      console.error('Google login error:', err);
      return res.redirect('/auth/login');
    }
    finishLogin(req, res, user);
  })(req, res, next);
});

// ---------------- LOGOUT ----------------
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

module.exports = router;
