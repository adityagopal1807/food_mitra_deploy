const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const { awardPoints, POINTS } = require('../utils/points');

// We use passport strictly for the Google OAuth handshake, with
// { session: false } on both routes/auth.js routes — the app's own
// req.session.userId (same pattern as the rest of the app) is the single
// source of truth for "who is logged in", so no serializeUser/deserializeUser
// is needed here.
function initPassport() {
  const hasGoogleCreds = process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET;

  if (!hasGoogleCreds) {
    console.warn('⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set — "Continue with Google" will show an error until you add them to .env.');
    return;
  }

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails && profile.emails[0] && profile.emails[0].value;
      if (!email) return done(new Error('Your Google account has no email on file.'));

      let user = await User.findOne({ email: email.toLowerCase() });
      let isNewUser = false;

      if (!user) {
        user = await User.create({
          name: profile.displayName || email.split('@')[0],
          email: email.toLowerCase(),
          googleId: profile.id,
          avatar: (profile.photos && profile.photos[0] && profile.photos[0].value) || null
        });
        isNewUser = true;
      } else if (!user.googleId) {
        // Existing OTP-only account signing in with Google for the first time — link it.
        user.googleId = profile.id;
        await user.save();
      }

      if (isNewUser) {
        await awardPoints(user._id, POINTS.SIGNUP);
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
}

module.exports = initPassport;
