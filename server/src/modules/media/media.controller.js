import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendCreated } from '../../utils/apiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { ingestBuffer, resolveAssetUrl } from '../../providers/storage/index.js';
import { detectImageType } from './upload.js';

// An upload not claimed by anything within the hour is reaped by the TTL index.
const UNCLAIMED_TTL_MS = 60 * 60 * 1000;

export const upload = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Choose a file to upload', { code: 'NO_FILE' });

  // The declared content-type is attacker-controlled; the bytes are not.
  const actualType = detectImageType(req.file.buffer);
  if (!actualType) {
    throw ApiError.badRequest('That file is not a PNG, JPEG or WebP image', {
      code: 'UNSUPPORTED_MEDIA_TYPE',
    });
  }

  if (req.file.size > env.UPLOAD_MAX_BYTES) {
    throw ApiError.badRequest('That file is too large', { code: 'FILE_TOO_LARGE' });
  }

  const asset = await ingestBuffer({
    body: req.file.buffer,
    contentType: actualType,
    ownerId: req.user._id,
    kind: 'reference',
    tempExpiresAt: new Date(Date.now() + UNCLAIMED_TTL_MS),
  });

  return sendCreated(res, {
    data: {
      assetId: String(asset._id),
      url: await resolveAssetUrl(asset),
      contentType: actualType,
      sizeBytes: asset.storage.sizeBytes,
    },
    message: 'Uploaded',
  });
});

export default { upload };
