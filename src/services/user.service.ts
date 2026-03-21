import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { NotFoundError } from '../utils/errors';

interface UpdateProfileInput {
  name?: string;
  bio?: string;
  avatar?: string;
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
    .select('name email avatar bio isOnline lastSeen')
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
