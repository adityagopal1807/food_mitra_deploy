// Protects any route that should only be reachable by a logged-in user
// (donating, listing food, managing orders, etc).
function requireUser(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/login');
}

// Sends already-logged-in users away from the login page instead of
// letting them see it again.
function redirectIfUser(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/account/dashboard');
  }
  return next();
}

module.exports = { requireUser, redirectIfUser };
