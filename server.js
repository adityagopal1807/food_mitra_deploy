// ---------------- CRYPTO POLYFILL ----------------
// Node 18 doesn't expose the Web Crypto API as a global (that only became
// automatic in Node 20+). The `mongodb` driver assumes `globalThis.crypto`
// exists and crashes with "ReferenceError: crypto is not defined" the
// moment it tries to authenticate a connection if it's missing. This is a
// no-op on Node 20+ where the global already exists, so it's safe either
// way — it just guarantees we never hard-crash if a host runs an older
// Node version than package.json's engines field asks for.
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto;
}

require('dotenv').config();

// Fail fast if required secrets are missing — better to crash on boot than
// run with an undefined session secret or no database.
const REQUIRED_ENV = ['MONGODB_URI', 'SESSION_SECRET'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`❌ Missing required environment variable(s): ${missingEnv.join(', ')}`);
  console.error('   Copy .env.example to .env and fill in real values before starting the server.');
  process.exit(1);
}

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const { MongoStore } = require('connect-mongo');
const connectDB = require('./config/db');
const initPassport = require('./config/passport');
const mainRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 8000;
const isProduction = process.env.NODE_ENV === 'production';

// ---------------- DATABASE ----------------
connectDB();

if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
  console.warn('⚠️  BREVO_API_KEY / BREVO_SENDER_EMAIL are not set — email OTP login will fail until you add Brevo credentials to .env.');
}

// Required when running behind a reverse proxy / load balancer
// (Render, Railway, Nginx, etc.) so secure cookies and req.ip work correctly.
app.set('trust proxy', 1);

// ---------------- VIEW ENGINE ----------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------------- SECURITY & PERFORMANCE MIDDLEWARE ----------------
app.use(helmet({
  // The app loads Google Fonts and Font Awesome from third-party CDNs,
  // so the default strict CSP would break styling. Keep it reasonably
  // relaxed but still restrict everything else.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      frameSrc: ["'self'", 'https://www.google.com'],
    }
  }
}));
app.use(compression());

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- SESSIONS ----------------
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'user_sessions',
    ttl: 60 * 60 * 24 * 7 // 7 days
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    secure: isProduction,     // only send cookie over HTTPS in production
    sameSite: 'lax'
  }
}));

// Make login state available to every EJS view automatically
app.use((req, res, next) => {
  res.locals.isLoggedIn = !!(req.session && req.session.userId);
  res.locals.currentUserName = (req.session && req.session.userName) || null;
  next();
});

// ---------------- PASSPORT (Google OAuth handshake only — see config/passport.js) ----------------
app.use(passport.initialize());
initPassport();

// ---------------- RATE LIMITING (brute-force / spam protection on auth) ----------------
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts. Please try again in a few minutes.'
});
app.use(['/auth/otp/request', '/auth/otp/verify'], authLimiter);

// ---------------- HEALTH CHECK (for uptime monitors / load balancers) ----------------
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ---------------- ROUTES ----------------
app.use('/auth', authRoutes);
app.use('/account', accountRoutes);
app.use('/api/v1', apiRoutes);
app.use('/', mainRoutes);

// ---------------- 404 HANDLER ----------------
app.use((req, res) => {
  res.status(404).send('<h1>404 - Page Not Found</h1><a href="/">Go Home</a>');
});

// ---------------- ERROR HANDLER ----------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('<h1>500 - Something went wrong</h1><a href="/">Go Home</a>');
});

const server = app.listen(PORT, () => {
  console.log(`🍱 FoodMitra server running at http://localhost:${PORT} [${process.env.NODE_ENV || 'development'}]`);
});

// ---------------- GRACEFUL SHUTDOWN ----------------
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing server gracefully');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received: closing server gracefully');
  server.close(() => process.exit(0));
});
