import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './notifications.controller.js';
import { listQuerySchema, notificationParamSchema } from './notifications.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', validate({ query: listQuerySchema }), controller.list);
// Declared before `/:notificationId` so the literal segment is not swallowed.
router.post('/read-all', controller.readAll);
router.post('/:notificationId/read', validate({ params: notificationParamSchema }), controller.read);

export default router;
