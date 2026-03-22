import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { protect } from '../middleware/auth.middleware';

const router = Router();

router.use(protect);

// GET    /api/notifications          — paginated list
router.get('/', notificationController.getNotifications);

// PATCH  /api/notifications/read/all — mark all as read
router.patch('/read/all', notificationController.markAllAsRead);

// POST /api/notifications/push/subscribe
router.post('/push/subscribe', notificationController.subscribePush);

// POST /api/notifications/push/unsubscribe
router.post('/push/unsubscribe', notificationController.unsubscribePush);

// PATCH  /api/notifications/:id/read — mark one as read
router.patch('/:id/read', notificationController.markOneAsRead);

// DELETE /api/notifications/:id
router.delete('/:id', notificationController.deleteNotification);

export default router;
