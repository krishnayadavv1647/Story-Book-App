import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { chatLimiter, generationLimiter } from '../../middleware/rateLimit.js';
import * as controller from './story.controller.js';
import { loadBook } from '../books/loadBook.js';
import { bookIdParamSchema } from '../books/books.validators.js';
import { chatSchema, generatePlanSchema, jobIdParamSchema } from './story.validators.js';

const router = Router();

router.use(requireAuth);

// Plan generation calls the model and takes real
// upstream time, so it gets the tighter generation limit.
router.get('/engines', controller.engines);
router.post('/chat', chatLimiter, validate({ body: chatSchema }), controller.chat);
router.post('/plan', generationLimiter, validate({ body: generatePlanSchema }), controller.generatePlan);
router.post(
  '/books/:bookId/regenerate',
  generationLimiter,
  validate({ params: bookIdParamSchema }),
  loadBook,
  controller.regenerate,
);
router.post('/jobs/:jobId/cancel', validate({ params: jobIdParamSchema }), controller.cancel);

export default router;
