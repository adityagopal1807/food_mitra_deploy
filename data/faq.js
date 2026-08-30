// Fallback FAQ replies for the FoodMitra chat assistant. The smarter,
// context-aware replies (personalized points/orders, pincode lookups, etc.)
// live in routes/index.js — this file is the generic backstop.
const faq = {
  "hello": "Hello 👋! How can I help you today?",
  "hi": "Hi there! 😊 How can I assist you?",
  "how to donate food": "Log in first (email OTP or Google), then go to your Dashboard and click 'Add Food Item' — fill in the details including phone, location, category and pickup address.",
  "how to list food": "Log in first, then go to 'List Surplus Food' — you can mark your listing Free or set a price for a Paid listing.",
  "where can i find food": "Browse the 'Browse Listings' page and search by your pincode to see what's available nearby.",
  "how to volunteer": "To volunteer, please reach out via the Contact page. We'd love your support! ❤️",
  "contact": "You can contact us via the 'Contact' page or email us at support@foodmitra.org.",
  "thank you": "You're welcome! 🌸 We appreciate your kindness.",
  "what is foodmitra": "FoodMitra connects people with surplus food to people and animals in need, reducing waste and fighting hunger. 🍱",
  "who can donate": "Anyone with an account! 🙌 Households, restaurants, hotels, or individuals can log in and donate or list food.",
  "is my food safe to donate": "Yes, we encourage donating only fresh & hygienic food. Spoiled food can be directed for animal feed or recycling.",
  "how to track my donation": "Every donation and listing you create shows up on your Dashboard, along with the points it earned you.",
  "where are you located": "We operate in multiple cities 🌍. Check our 'About Us' page for detailed locations.",
  "can i donate money": "Currently, we focus on food donations. Monetary donations may be available in the future.",
  "how to report an issue": "If you face any issue, please report it via the 'Contact' page or email support@foodmitra.org.",
  "how to feed animals": "You can select 'For Animals' as the category when adding a food item, and we'll route it properly.",
  "mission": "Our mission is to reduce food waste and ensure no one sleeps hungry. 🌍❤️",
  "leaderboard": "The Leaderboard ranks users by points — earned for signing up, listing food, introducing new pincodes, and getting orders confirmed. It's the same table for all regions, updated live.",
  "how does the leaderboard work": "You earn +5 for joining, +10 per listing, +20 the first time you list from a brand-new pincode, and +15 when someone's order on your listing is confirmed.",
  "how to login": "FoodMitra login is passwordless — enter your email to get a one-time code (OTP), or use 'Continue with Google'.",
  "how to order food": "Browse Listings, pick an item, and submit the order form. The person who listed it will Confirm or Reject it, and you'll see the status update on your Dashboard.",
  "pincode": "Search or filter listings by pincode on the 'Browse Listings' page. The first listing from a new pincode earns the lister bonus leaderboard points!"
};

module.exports = faq;
