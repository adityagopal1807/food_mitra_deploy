const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');

// Images are uploaded straight to Cloudinary instead of the local disk.
// Render's filesystem is wiped on every deploy/restart, so anything saved
// to public/images would disappear — Cloudinary keeps them permanently and
// gives back a stable HTTPS URL that we store on the FoodItem document.
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'foodmitra',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    // Keep uploads a reasonable size; Cloudinary will downscale if larger.
    transformation: [{ width: 1600, height: 1600, crop: 'limit' }]
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

module.exports = upload;
