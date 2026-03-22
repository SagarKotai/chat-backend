import { Request, Response, NextFunction } from 'express';
import * as notificationService from '../services/notification.service';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = req.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(50, parseInt(query.limit ?? '20', 10));

    const result = await notificationService.getNotifications(
      (req as AuthenticatedRequest).user._id,
      page,
      limit,
    );
    sendSuccess(res, result, 'Notifications retrieved');
  } catch (err) {
    next(err);
  }
};

export const markOneAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await notificationService.markNotificationRead(
      req.params.id,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, notification, 'Notification marked as read');
  } catch (err) {
    next(err);
  }
};

export const markAllAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAllNotificationsRead((req as AuthenticatedRequest).user._id);
    sendSuccess(res, null, 'All notifications marked as read');
  } catch (err) {
    next(err);
  }
};

export const deleteNotification = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.deleteNotification(
      req.params.id,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, null, 'Notification deleted');
  } catch (err) {
    next(err);
  }
};

export const subscribePush = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { subscription } = req.body as {
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    };

    await notificationService.subscribePush(
      (req as AuthenticatedRequest).user._id,
      subscription,
      req.headers['user-agent'],
    );

    sendSuccess(res, null, 'Push subscription saved');
  } catch (err) {
    next(err);
  }
};

export const unsubscribePush = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { endpoint } = req.body as { endpoint: string };
    await notificationService.unsubscribePush((req as AuthenticatedRequest).user._id, endpoint);
    sendSuccess(res, null, 'Push subscription removed');
  } catch (err) {
    next(err);
  }
};
