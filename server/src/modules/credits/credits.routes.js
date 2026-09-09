import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './credits.controller.js';
import { historyQuerySchema } from './credits.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', controller.balance);
router.get('/history', validate({ query: historyQuerySchema }), controller.history);

export default router;
