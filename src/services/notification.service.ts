import { Types } from 'mongoose';
import { Notification } from '../models/notification.model';
import { NotFoundError } from '../utils/errors';

/** Fetch paginated notifications for the current user */
export const getNotifications = async (
  userId: Types.ObjectId,
  page: number,
  limit: number,
) => {
  const skip = (page - 1) * limit;
  const [notifications, totalCount] = await Promise.all([
    Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'name avatar')
      .populate('chat', 'name isGroupChat'),
    Notification.countDocuments({ recipient: userId }),
  ]);

  return {
    data: notifications,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
    unreadCount: await Notification.countDocuments({ recipient: userId, isRead: false }),
  };
};

/** Mark a single notification as read */
export const markNotificationRead = async (
  notificationId: string,
  userId: Types.ObjectId,
) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isRead: true, readAt: new Date() },
    { new: true },
  );
  if (!notification) throw new NotFoundError('Notification not found');
  return notification;
};

/** Mark all notifications as read for the current user */
export const markAllNotificationsRead = async (userId: Types.ObjectId): Promise<void> => {
  await Notification.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
};

/** Delete a notification */
export const deleteNotification = async (
  notificationId: string,
  userId: Types.ObjectId,
): Promise<void> => {
  const result = await Notification.deleteOne({
    _id: new Types.ObjectId(notificationId),
    recipient: userId,
  });
  if (result.deletedCount === 0) throw new NotFoundError('Notification not found');
};
