import { Types } from 'mongoose';
import { Notification } from '../models/notification.model';
import { NotFoundError } from '../utils/errors';
import { User } from '../models/user.model';
import { sendWebPush } from '../utils/webPush';

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

export const subscribePush = async (
  userId: Types.ObjectId,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  userAgent?: string,
): Promise<void> => {
  const user = await User.findById(userId).select('+pushSubscriptions');
  if (!user) throw new NotFoundError('User not found');

  const existing = user.pushSubscriptions.find((item) => item.endpoint === subscription.endpoint);
  const now = new Date();

  if (existing) {
    existing.keys = subscription.keys;
    existing.lastUsedAt = now;
    existing.userAgent = userAgent ?? '';
  } else {
    user.pushSubscriptions.push({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent: userAgent ?? '',
      createdAt: now,
      lastUsedAt: now,
    });
  }

  await user.save();
};

export const unsubscribePush = async (userId: Types.ObjectId, endpoint: string): Promise<void> => {
  const user = await User.findById(userId).select('+pushSubscriptions');
  if (!user) throw new NotFoundError('User not found');

  user.pushSubscriptions = user.pushSubscriptions.filter((item) => item.endpoint !== endpoint);
  await user.save();
};

export const sendPushToUsers = async (
  userIds: Types.ObjectId[],
  payload: Record<string, unknown>,
): Promise<void> => {
  if (!userIds.length) return;

  const users = await User.find({ _id: { $in: userIds } }).select('+pushSubscriptions');

  for (const user of users) {
    if (!user.pushSubscriptions.length) continue;

    const aliveSubscriptions: typeof user.pushSubscriptions = [];

    for (const sub of user.pushSubscriptions) {
      const ok = await sendWebPush(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        },
        payload,
      );
      if (ok) aliveSubscriptions.push(sub);
    }

    if (aliveSubscriptions.length !== user.pushSubscriptions.length) {
      user.pushSubscriptions = aliveSubscriptions;
      await user.save();
    }
  }
};
