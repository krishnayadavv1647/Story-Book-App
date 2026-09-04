import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './admin.controller.js';
import { listUsersQuerySchema } from './admin.validators.js';

/** Every route here is admin-only, enforced once at the mount. */
const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/overview', controller.overview);
router.get('/users', validate({ query: listUsersQuerySchema }), controller.users);
router.get('/audit', controller.audit);

export default router;
