import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { loadBook } from '../books/loadBook.js';
import { generationLimiter } from '../../middleware/rateLimit.js';
import * as controller from './pages.controller.js';
import {
  addPageSchema,
  bookParamSchema,
  pageParamSchema,
  reorderSchema,
  rewritePageSchema,
  setPageArtworkSchema,
  updatePageSchema,
} from './pages.validators.js';

// `mergeParams` so :bookId from the parent mount is visible here.
const router = Router({ mergeParams: true });

router.get('/', validate({ params: bookParamSchema }), loadBook, controller.list);

router.post('/', validate({ params: bookParamSchema, body: addPageSchema }), loadBook, controller.add);

// Declared before `/:pageId` so the literal segment is not swallowed by it.
router.patch(
  '/reorder',
  validate({ params: bookParamSchema, body: reorderSchema }),
  loadBook,
  controller.reorder,
);

// Structural pages for older books — literal paths, declared before `/:pageId`.
router.post('/title-page', validate({ params: bookParamSchema }), loadBook, controller.addTitlePage);
router.post('/ending-page', validate({ params: bookParamSchema }), loadBook, controller.addEndingPage);
router.post('/prepare-print', validate({ params: bookParamSchema }), loadBook, controller.preparePrint);

router.patch(
  '/:pageId',
  validate({ params: pageParamSchema, body: updatePageSchema }),
  loadBook,
  controller.update,
);

router.post(
  '/:pageId/duplicate',
  validate({ params: pageParamSchema }),
  loadBook,
  controller.duplicate,
);

router.post(
  '/:pageId/magic-layout',
  validate({ params: pageParamSchema }),
  loadBook,
  controller.magicLayout,
);

router.post(
  '/:pageId/artwork',
  validate({ params: pageParamSchema, body: setPageArtworkSchema }),
  loadBook,
  controller.setArtwork,
);

// Rewriting calls the model and replaces content, so it is a POST, not a PATCH.
router.post(
  '/:pageId/rewrite',
  generationLimiter,
  validate({ params: pageParamSchema, body: rewritePageSchema }),
  loadBook,
  controller.rewrite,
);

router.delete('/:pageId', validate({ params: pageParamSchema }), loadBook, controller.remove);

export default router;
