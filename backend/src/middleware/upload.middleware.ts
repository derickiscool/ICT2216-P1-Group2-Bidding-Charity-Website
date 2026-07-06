import multer from 'multer';
import { badRequest } from '../utils/errors';

// Image-upload guardrails for FR07
// We keep the upload settings close to the route layer so every listing image upload receives the same file-count, file-size, and MIME-type checks before it reaches the controller/service logic.
export const MAX_LISTING_IMAGES = 5;
export const MAX_LISTING_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB per image keeps payloads reasonable for the project DB.

const ALLOWED_LISTING_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const uploadListingImages = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_LISTING_IMAGES,
    fileSize: MAX_LISTING_IMAGE_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    // MIME-type checks are not the only security control, but they reject obvious
    // non-image uploads early. The service layer also checks file signatures.
    if (!ALLOWED_LISTING_IMAGE_MIME_TYPES.has(file.mimetype)) {
      cb(badRequest('Only JPG, PNG, or WebP listing images are allowed.', 'INVALID_LISTING_IMAGE'));
      return;
    }
    cb(null, true);
  },
}).array('images', MAX_LISTING_IMAGES);
