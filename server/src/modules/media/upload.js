import multer from 'multer';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Inbound file uploads.
 *
 * Held in memory rather than written to disk: the file goes straight into object
 * storage, and a temp file would be one more thing to clean up and one more path
 * to get wrong.
 *
 * The MIME allow-list is a first gate, not the last word — a client controls the
 * header it sends, so the magic-byte check below is what actually decides.
 */
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.UPLOAD_MAX_BYTES,
    files: 1,
    // Refuse a multipart body carrying a surprise field payload.
    fields: 4,
  },
  fileFilter(_req, file, callback) {
    if (!ALLOWED.has(file.mimetype)) {
      callback(
        ApiError.badRequest('Upload a PNG, JPEG or WebP image', { code: 'UNSUPPORTED_MEDIA_TYPE' }),
      );
      return;
    }
    callback(null, true);
  },
}).single('file');

/**
 * Confirms the bytes really are the image type they claim to be.
 *
 * A declared content-type is attacker-controlled: without this, an HTML or SVG
 * payload could be stored and later served from our own origin.
 */
const SIGNATURES = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

export function detectImageType(buffer) {
  for (const { type, bytes } of SIGNATURES) {
    if (bytes.every((byte, index) => buffer[index] === byte)) return type;
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/** Turns multer's own errors into our envelope instead of a raw 500. */
export function handleUpload(req, res, next) {
  uploadImage(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        ApiError.badRequest(
          `That file is larger than ${Math.round(env.UPLOAD_MAX_BYTES / 1024 / 1024)}MB`,
          { code: 'FILE_TOO_LARGE' },
        ),
      );
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(ApiError.badRequest('Upload one file at a time', { code: 'TOO_MANY_FILES' }));
    }

    return next(err);
  });
}

export default { handleUpload, detectImageType };
