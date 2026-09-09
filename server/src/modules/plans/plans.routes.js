import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import * as controller from './plans.controller.js';

/**
 * The reader's view of plans. Managing them is an admin action and lives on the
 * admin router, so there is exactly one place where a plan can be changed.
 */
const router = Router();

router.use(requireAuth);

router.get('/', controller.listVisible);

export default router;
