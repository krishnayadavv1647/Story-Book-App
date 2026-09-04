import { Router } from 'express';
import { z } from 'zod';

import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { uploadLimiter } from '../../middleware/rateLimit.js';
import { handleUpload } from './upload.js';
import * as controller from './media.controller.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ExportJob, MediaAsset } from '../../models/index.js';
import { storage } from '../../providers/storage/index.js';
import { verifyAssetUrl } from '../../providers/storage/signing.js';

const router = Router();

/**
 * Upload is authenticated and rate limited; the read route below deliberately is
 * not, because an <img> cannot carry a bearer token.
 */
router.post('/upload', requireAuth, uploadLimiter, handleUpload, controller.upload);

/**
 * Serves an object when the storage driver has no public host of its own — the
 * in-memory driver used for local development.
 *
 * Deliberately not behind `requireAuth`: an <img> cannot send an Authorization
 * header. Access is proved by the signature in the query string, which covers
 * the asset id and an expiry, so a leaked link expires and cannot be edited to
 * reach another asset.
 */
router.get(
  '/:assetId',
  validate({
    params: z.object({ assetId: z.string().regex(/^[0-9a-fA-F]{24}$/) }),
    query: z.object({ exp: z.string(), sig: z.string() }),
  }),
  asyncHandler(async (req, res) => {
    const { assetId } = req.validated.params;
    const { exp, sig } = req.validated.query;

    if (!verifyAssetUrl({ assetId, exp, sig })) {
      throw ApiError.forbidden('This media link is invalid or has expired');
    }

    const asset = await MediaAsset.findById(assetId);
    if (!asset || asset.status !== 'stored') throw ApiError.notFound('Media not found');

    const object = await storage.get(asset.storage.key);
    if (!object) throw ApiError.notFound('Media not found');

    res.setHeader('Content-Type', asset.storage.contentType ?? 'application/octet-stream');

    // An export is a file someone asked to keep, so it is sent as an attachment
    // under the name the export screen showed them — not left to open inline
    // under a UUID.
    if (asset.kind === 'export') {
      const job = await ExportJob.findOne({ outputAssetId: asset._id }).select('options.filename');
      const filename = (job?.options?.filename || 'storybook.pdf').replace(/[^\w.-]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    // The app may be served from a different origin than the API. Access is
    // already proved by the signature, so the default `same-site` policy would
    // only block a legitimate <img>.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Immutable content at a signed URL: cache for the life of the signature.
    res.setHeader('Cache-Control', 'private, max-age=900, immutable');
    return res.send(object.body);
  }),
);

export default router;
