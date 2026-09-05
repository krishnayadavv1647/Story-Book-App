import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import * as controller from './users.controller.js';
import { apiKeysSchema, changePasswordSchema, updateProfileSchema } from './users.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/me', controller.me);
router.patch('/me', validate({ body: updateProfileSchema }), controller.update);

// Rate-limited like the other credential routes: this one verifies a password.
router.post(
  '/me/password',
  authLimiter,
  validate({ body: changePasswordSchema }),
  controller.changePassword,
);

// BYOK: set or clear the user's own provider API keys. Rate-limited like the
// other credential routes — it accepts secrets.
router.put(
  '/me/api-keys',
  authLimiter,
  validate({ body: apiKeysSchema }),
  controller.setApiKeys,
);

export default router;
