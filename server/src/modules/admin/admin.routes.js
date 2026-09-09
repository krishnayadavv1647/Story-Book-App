import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './admin.controller.js';
import { listUsersQuerySchema, userParamSchema } from './admin.validators.js';
import { adjustCreditsSchema } from '../credits/credits.validators.js';

/** Every route here is admin-only, enforced once at the mount. */
const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/overview', controller.overview);
router.get('/users', validate({ query: listUsersQuerySchema }), controller.users);
// Hands credits to an account, or corrects one down. The only top-up there is.
router.post(
  '/users/:userId/credits',
  validate({ params: userParamSchema, body: adjustCreditsSchema }),
  controller.adjustCredits,
);
router.get('/audit', controller.audit);

export default router;
