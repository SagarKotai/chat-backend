import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { NotFoundError } from '../utils/errors';

interface UpdateProfileInput {
  name?: string;
  bio?: string;
  avatar?: string;
  publicKey?: string;
}

interface UpsertDeviceKeyInput {
  deviceId: string;
  publicKey: string;
}

interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Get a single user by ID (public profile view) */
export const getUserById = async (userId: string) => {
  const user = await User.findById(userId).select('-password -refreshTokens');
  if (!user) throw new NotFoundError('User not found');
  return user;
};

/**
 * Search users by name or email.
 * Excludes the requesting user from results.
 * Uses MongoDB text index when available, falls back to regex.
 */
export const searchUsers = async (query: string, excludeId: Types.ObjectId) => {
  const regex = new RegExp(query, 'i');
  return User.find({
    _id: { $ne: excludeId },
    $or: [{ name: regex }, { email: regex }],
  })
    .select('name email avatar bio isOnline lastSeen publicKey')
    .limit(20);
};

/** Update current user's editable profile fields */
export const updateProfile = async (
  userId: Types.ObjectId,
  input: UpdateProfileInput,
) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: input },
    { new: true, runValidators: true },
  ).select('-password -refreshTokens');

  if (!user) throw new NotFoundError('User not found');
  return user;
};

/** Set online/offline status + lastSeen */
export const setOnlineStatus = async (
  userId: Types.ObjectId,
  isOnline: boolean,
): Promise<void> => {
  await User.findByIdAndUpdate(userId, {
    isOnline,
    ...(isOnline ? {} : { lastSeen: new Date() }),
  });
};

/** Register or rotate an E2EE key for a specific device */
export const upsertE2EEKey = async (
  userId: Types.ObjectId,
  input: UpsertDeviceKeyInput,
) => {
  const user = await User.findById(userId).select('+e2eeKeys');
  if (!user) throw new NotFoundError('User not found');

  const existing = user.e2eeKeys.find((entry) => entry.deviceId === input.deviceId);
  const now = new Date();

  if (existing) {
    existing.publicKey = input.publicKey;
    existing.lastUsedAt = now;
    existing.revokedAt = null;
  } else {
    user.e2eeKeys.push({
      deviceId: input.deviceId,
      publicKey: input.publicKey,
      createdAt: now,
      lastUsedAt: now,
      revokedAt: null,
    });
  }

  user.publicKey = input.publicKey;
  await user.save();

  return user.e2eeKeys.filter((entry) => !entry.revokedAt);
};

/** Revoke a specific device key */
export const revokeE2EEKey = async (
  userId: Types.ObjectId,
  deviceId: string,
) => {
  const user = await User.findById(userId).select('+e2eeKeys');
  if (!user) throw new NotFoundError('User not found');

  const existing = user.e2eeKeys.find((entry) => entry.deviceId === deviceId);
  if (!existing) throw new NotFoundError('Device key not found');

  existing.revokedAt = new Date();
  await user.save();

  return user.e2eeKeys.filter((entry) => !entry.revokedAt);
};

/** List active device keys for current user */
export const getE2EEKeys = async (userId: Types.ObjectId) => {
  const user = await User.findById(userId).select('+e2eeKeys');
  if (!user) throw new NotFoundError('User not found');
  return user.e2eeKeys.filter((entry) => !entry.revokedAt);
};

/** Add or refresh a push subscription for this user */
export const upsertPushSubscription = async (
  userId: Types.ObjectId,
  subscription: PushSubscriptionInput,
  userAgent = '',
): Promise<void> => {
  const user = await User.findById(userId).select('+pushSubscriptions');
  if (!user) throw new NotFoundError('User not found');

  const existing = user.pushSubscriptions.find((item) => item.endpoint === subscription.endpoint);
  const now = new Date();

  if (existing) {
    existing.keys = subscription.keys;
    existing.lastUsedAt = now;
    existing.userAgent = userAgent;
  } else {
    user.pushSubscriptions.push({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent,
      createdAt: now,
      lastUsedAt: now,
    });
  }

  await user.save();
};

/** Remove a push subscription for this user */
export const removePushSubscription = async (
  userId: Types.ObjectId,
  endpoint: string,
): Promise<void> => {
  const user = await User.findById(userId).select('+pushSubscriptions');
  if (!user) throw new NotFoundError('User not found');

  user.pushSubscriptions = user.pushSubscriptions.filter((item) => item.endpoint !== endpoint);
  await user.save();
};
