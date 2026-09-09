import { Router } from 'express';
import healthRoutes from './health.routes.js';
import configRoutes from './config.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import bookRoutes from '../modules/books/books.routes.js';
import storyRoutes from '../modules/story-generation/story.routes.js';
import characterRoutes from '../modules/characters/characters.routes.js';
import generationRoutes from '../modules/image-generation/image.routes.js';
import mediaRoutes from '../modules/media/media.routes.js';
import exportRoutes from '../modules/exports/exports.routes.js';
import notificationRoutes from '../modules/notifications/notifications.routes.js';
import userRoutes from '../modules/users/users.routes.js';
import creditRoutes from '../modules/credits/credits.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';

/**
 * The single /api/v1 surface. Feature routers are mounted here as their phases
 * land; every one of them inherits the envelope, the trace id and the error
 * pipeline configured in app.js.
 */
const router = Router();

router.use(healthRoutes);
router.use(configRoutes);
router.use('/auth', authRoutes);
router.use('/books', bookRoutes);
router.use('/story', storyRoutes);
router.use('/characters', characterRoutes);
router.use('/generation', generationRoutes);
router.use('/media', mediaRoutes);
router.use('/exports', exportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/users', userRoutes);
router.use('/credits', creditRoutes);
router.use('/admin', adminRoutes);


export default router;
