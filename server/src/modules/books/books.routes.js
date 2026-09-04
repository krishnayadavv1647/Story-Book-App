import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { exportLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './books.controller.js';
import { loadBook } from './loadBook.js';
import pageRoutes from '../pages/pages.routes.js';
import * as characterController from '../characters/characters.controller.js';
import {
  attachCharacterSchema,
  characterIdParamSchema,
} from '../characters/characters.validators.js';
import {
  bookIdParamSchema,
  listBooksQuerySchema,
  updateBookSchema,
} from './books.validators.js';
import * as exportController from '../exports/exports.controller.js';
import { createExportSchema, publishSchema } from '../exports/exports.validators.js';

const router = Router();

// Everything under /books belongs to the signed-in account.
router.use(requireAuth);

// Declared before any `/:id` route so the literal segment always wins.
router.get('/summary', controller.summary);
router.get('/', validate({ query: listBooksQuerySchema }), controller.list);

// Nested pages inherit the ownership check from `loadBook` inside that router.
router.use('/:bookId/pages', pageRoutes);

// Exports live under the book so they inherit `loadBook`'s ownership check.
router.get(
  '/:bookId/export/options',
  validate({ params: bookIdParamSchema }),
  loadBook,
  exportController.options,
);

// The automatic print-quality report for the book — read-only, safe to poll.
router.get(
  '/:bookId/print-check',
  validate({ params: bookIdParamSchema }),
  loadBook,
  exportController.printCheck,
);

router.post(
  '/:bookId/export',
  exportLimiter,
  validate({ params: bookIdParamSchema, body: createExportSchema }),
  loadBook,
  exportController.create,
);

router.post(
  '/:bookId/publish',
  validate({ params: bookIdParamSchema, body: publishSchema }),
  loadBook,
  exportController.publish,
);

// The book's cast: attaching an existing character, or removing one.
router.post(
  '/:bookId/characters',
  validate({ params: bookIdParamSchema, body: attachCharacterSchema }),
  loadBook,
  characterController.attach,
);
router.delete(
  '/:bookId/characters/:characterId',
  validate({ params: bookIdParamSchema.merge(characterIdParamSchema) }),
  loadBook,
  characterController.detach,
);

router.get('/:bookId', validate({ params: bookIdParamSchema }), loadBook, controller.detail);
router.patch(
  '/:bookId',
  validate({ params: bookIdParamSchema, body: updateBookSchema }),
  loadBook,
  controller.update,
);
router.delete(
  '/:bookId',
  validate({ params: bookIdParamSchema }),
  loadBook,
  controller.remove,
);

export default router;
