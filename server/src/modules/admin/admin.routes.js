import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './admin.controller.js';
import { listUsersQuerySchema, updateUserSchema, userParamSchema } from './admin.validators.js';
import { adjustCreditsSchema } from '../credits/credits.validators.js';
import * as plans from '../plans/plans.controller.js';
import * as bonusLinks from '../bonus-links/bonusLinks.controller.js';
import {
  createBonusLinkSchema,
  linkParamSchema,
  updateBonusLinkSchema,
} from '../bonus-links/bonusLinks.validators.js';
import {
  assignPlanSchema,
  createPlanSchema,
  planParamSchema,
  updatePlanSchema,
} from '../plans/plans.validators.js';

/** Every route here is admin-only, enforced once at the mount. */
const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/overview', controller.overview);
router.get('/users', validate({ query: listUsersQuerySchema }), controller.users);
router.get('/users/:userId', validate({ params: userParamSchema }), controller.userDetail);
// Suspend, reactivate, promote, demote. Refused on your own account.
router.patch(
  '/users/:userId',
  validate({ params: userParamSchema, body: updateUserSchema }),
  controller.updateUser,
);
// Hands credits to an account, or corrects one down. The only top-up there is.
router.post(
  '/users/:userId/credits',
  validate({ params: userParamSchema, body: adjustCreditsSchema }),
  controller.adjustCredits,
);
// Putting an account on a plan is what hands over the plan's credits.
router.post(
  '/users/:userId/plan',
  validate({ params: userParamSchema, body: assignPlanSchema }),
  plans.assign,
);
router.delete('/users/:userId/plan', validate({ params: userParamSchema }), plans.cancel);

// Plans. The admin view lists everything, including drafts nobody can see yet.
router.get('/plans', plans.listAll);
router.post('/plans', validate({ body: createPlanSchema }), plans.create);
router.patch(
  '/plans/:planId',
  validate({ params: planParamSchema, body: updatePlanSchema }),
  plans.update,
);
router.delete('/plans/:planId', validate({ params: planParamSchema }), plans.remove);

// Bonus sign-up links: hand one out, see how often it was redeemed, switch it off.
router.get('/bonus-links', bonusLinks.list);
router.post('/bonus-links', validate({ body: createBonusLinkSchema }), bonusLinks.create);
router.patch(
  '/bonus-links/:linkId',
  validate({ params: linkParamSchema, body: updateBonusLinkSchema }),
  bonusLinks.update,
);

router.get('/audit', controller.audit);

export default router;
