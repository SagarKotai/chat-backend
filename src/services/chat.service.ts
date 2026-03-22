import { Types } from 'mongoose';
import { Chat } from '../models/chat.model';
import { Message } from '../models/message.model';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors';

/**
 * Access or create a 1-to-1 chat between two users.
 * Returns the existing chat if one already exists.
 */
export const accessOrCreateChat = async (
  currentUserId: Types.ObjectId,
  targetUserId: string,
) => {
  // Find an existing private chat containing exactly these two users
  const existing = await Chat.findOne({
    isGroupChat: false,
    participants: { $all: [currentUserId, targetUserId], $size: 2 },
  })
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'name avatar' },
    });

  if (existing) return existing;

  return Chat.create({
    isGroupChat: false,
    participants: [currentUserId, new Types.ObjectId(targetUserId)],
    createdBy: currentUserId,
  }).then((chat) =>
    Chat.findById(chat._id).populate('participants', 'name email avatar isOnline lastSeen publicKey'),
  );
};

/** Fetch all chats for the current user, sorted by most recent activity */
export const getUserChats = async (userId: Types.ObjectId) => {
  return Chat.find({ participants: userId })
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate('mutedUsers.user', 'name email avatar')
    .populate('mutedUsers.mutedBy', 'name email avatar')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'name avatar' },
    })
    .sort({ updatedAt: -1 });
};

/** Search group chats by name/description for current user */
export const searchGroupChats = async (
  userId: Types.ObjectId,
  query: string,
  limit = 20,
) => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const safeLimit = Math.max(1, Math.min(100, limit));
  const baseFilter = {
    isGroupChat: true,
    participants: userId,
  };

  const textResults = await Chat.find({
    ...baseFilter,
    $text: { $search: trimmed },
  })
    .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
    .limit(safeLimit)
    .select({ score: { $meta: 'textScore' } })
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'name avatar' },
    });

  if (textResults.length > 0) return textResults;

  const regex = new RegExp(trimmed, 'i');
  return Chat.find({
    ...baseFilter,
    $or: [{ name: regex }, { description: regex }],
  })
    .sort({ updatedAt: -1 })
    .limit(safeLimit)
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'name avatar' },
    });
};

// ─── Group chat operations ────────────────────────────────────────────────────

interface CreateGroupInput {
  name: string;
  participantIds: string[];
  description?: string;
  avatar?: string;
}

export const createGroupChat = async (
  currentUserId: Types.ObjectId,
  input: CreateGroupInput,
) => {
  if (input.participantIds.length < 2) {
    throw new BadRequestError('Group chat requires at least 3 members (including you)');
  }

  const uniqueIds = [...new Set([currentUserId.toString(), ...input.participantIds])];

  const chat = await Chat.create({
    isGroupChat: true,
    name: input.name,
    description: input.description ?? '',
    avatar: input.avatar ?? '',
    participants: uniqueIds.map((id) => new Types.ObjectId(id)),
    admin: currentUserId,
    groupAdmins: [currentUserId],
    createdBy: currentUserId,
  });

  return Chat.findById(chat._id)
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate('admin', 'name email avatar');
};

export const renameGroupChat = async (
  chatId: string,
  name: string,
  requesterId: Types.ObjectId,
) => {
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.isGroupChat) throw new NotFoundError('Group chat not found');

  const isAdmin = chat.groupAdmins.some((id) => id.equals(requesterId));
  if (!isAdmin) throw new ForbiddenError('Only admins can rename the group');

  chat.name = name;
  await chat.save();

  return Chat.findById(chatId)
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate('admin', 'name email avatar');
};

export const addParticipants = async (
  chatId: string,
  userIds: string[],
  requesterId: Types.ObjectId,
) => {
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.isGroupChat) throw new NotFoundError('Group chat not found');

  const isAdmin = chat.groupAdmins.some((id) => id.equals(requesterId));
  if (!isAdmin) throw new ForbiddenError('Only admins can add participants');

  const newIds = userIds
    .filter((id) => !chat.participants.some((p) => p.equals(id)))
    .map((id) => new Types.ObjectId(id));

  chat.participants.push(...newIds);
  await chat.save();

  return Chat.findById(chatId).populate('participants', 'name email avatar isOnline lastSeen publicKey');
};

export const removeParticipant = async (
  chatId: string,
  targetUserId: string,
  requesterId: Types.ObjectId,
) => {
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.isGroupChat) throw new NotFoundError('Group chat not found');

  const isAdmin = chat.groupAdmins.some((id) => id.equals(requesterId));
  const isSelf = requesterId.toString() === targetUserId;

  if (!isAdmin && !isSelf) throw new ForbiddenError('Not authorised to remove this user');

  // Primary admin cannot be removed by others
  if (chat.admin.equals(targetUserId) && !isSelf) {
    throw new ForbiddenError('Cannot remove the primary admin');
  }

  chat.participants = chat.participants.filter((p) => !p.equals(targetUserId));
  chat.groupAdmins = chat.groupAdmins.filter((p) => !p.equals(targetUserId));
  await chat.save();

  return Chat.findById(chatId).populate('participants', 'name email avatar isOnline lastSeen publicKey');
};

export const promoteToAdmin = async (
  chatId: string,
  targetUserId: string,
  requesterId: Types.ObjectId,
) => {
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.isGroupChat) throw new NotFoundError('Group chat not found');

  if (!chat.admin.equals(requesterId))
    throw new ForbiddenError('Only the primary admin can promote members');

  const isParticipant = chat.participants.some((p) => p.equals(targetUserId));
  if (!isParticipant) throw new BadRequestError('User is not a participant');

  const alreadyAdmin = chat.groupAdmins.some((p) => p.equals(targetUserId));
  if (!alreadyAdmin) {
    chat.groupAdmins.push(new Types.ObjectId(targetUserId));
    await chat.save();
  }

  return Chat.findById(chatId).populate('participants', 'name email avatar isOnline lastSeen publicKey');
};

export const getChatById = async (chatId: string, userId: Types.ObjectId) => {
  const chat = await Chat.findById(chatId)
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate('mutedUsers.user', 'name email avatar')
    .populate('mutedUsers.mutedBy', 'name email avatar')
    .populate('admin', 'name email avatar')
    .populate('groupAdmins', 'name email avatar')
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'name avatar' },
    });

  if (!chat) throw new NotFoundError('Chat not found');

  const isMember = chat.participants.some((p: { _id: Types.ObjectId }) => p._id.equals(userId));
  if (!isMember) throw new ForbiddenError('You are not a member of this chat');

  return chat;
};

export const muteParticipant = async (
  chatId: string,
  targetUserId: string,
  requesterId: Types.ObjectId,
  minutes?: number,
  reason?: string,
) => {
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.isGroupChat) throw new NotFoundError('Group chat not found');

  const isAdmin = chat.groupAdmins.some((id) => id.equals(requesterId));
  if (!isAdmin) throw new ForbiddenError('Only admins can mute users');

  if (!chat.participants.some((id) => id.equals(targetUserId))) {
    throw new BadRequestError('User is not a participant in this group');
  }

  const existing = chat.mutedUsers.find((entry) => entry.user.equals(targetUserId));
  const mutedUntil = minutes ? new Date(Date.now() + minutes * 60 * 1000) : null;

  if (existing) {
    existing.mutedBy = requesterId;
    existing.mutedUntil = mutedUntil;
    existing.reason = reason ?? '';
  } else {
    chat.mutedUsers.push({
      user: new Types.ObjectId(targetUserId),
      mutedBy: requesterId,
      mutedUntil,
      reason: reason ?? '',
    });
  }

  await chat.save();

  return Chat.findById(chatId)
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate('mutedUsers.user', 'name email avatar')
    .populate('mutedUsers.mutedBy', 'name email avatar');
};

export const unmuteParticipant = async (
  chatId: string,
  targetUserId: string,
  requesterId: Types.ObjectId,
) => {
  const chat = await Chat.findById(chatId);
  if (!chat || !chat.isGroupChat) throw new NotFoundError('Group chat not found');

  const isAdmin = chat.groupAdmins.some((id) => id.equals(requesterId));
  if (!isAdmin) throw new ForbiddenError('Only admins can unmute users');

  chat.mutedUsers = chat.mutedUsers.filter((entry) => !entry.user.equals(targetUserId));
  await chat.save();

  return Chat.findById(chatId)
    .populate('participants', 'name email avatar isOnline lastSeen publicKey')
    .populate('mutedUsers.user', 'name email avatar')
    .populate('mutedUsers.mutedBy', 'name email avatar');
};
