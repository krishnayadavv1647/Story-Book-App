import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './exports.controller.js';
import { jobParamSchema, listExportsQuerySchema } from './exports.validators.js';

/**
 * Account-level export routes. The book-scoped ones (create, options, publish)
 * are mounted under /books/:bookId so they inherit `loadBook`'s ownership check.
 */
const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listExportsQuerySchema }), controller.list);
router.get('/:jobId', validate({ params: jobParamSchema }), controller.detail);

export default router;
