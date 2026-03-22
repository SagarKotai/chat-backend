import { Types } from 'mongoose';
import { Message, IMessage } from '../models/message.model';
import { Chat } from '../models/chat.model';
import { Notification } from '../models/notification.model';
import { sendPushToUsers } from './notification.service';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { PaginatedResult } from '../types';

interface SendMessageInput {
  chatId: string;
  senderId: Types.ObjectId;
  content: string;
  contentType?: IMessage['contentType'];
  fileUrl?: string;
  filePublicId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  replyTo?: string;
  isEncrypted?: boolean;
  encryptedFor?: Record<string, string>;
}

const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name avatar email' },
  { path: 'readBy.user', select: 'name avatar' },
  { path: 'replyTo', populate: { path: 'sender', select: 'name avatar' } },
];

interface MessageSearchInput {
  query: string;
  userId: Types.ObjectId;
  chatId?: string;
  limit?: number;
}

interface MessageDeliveryResult {
  messageId: string;
  chatId: string;
  senderId: string;
}

interface MarkReadResult {
  messageIds: string[];
  senderIds: string[];
}

interface SmartSummary {
  title: string;
  totalMessages: number;
  activeParticipants: string[];
  highlights: string[];
}

const sanitizeWord = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

/** Send a new message and update the chat's lastMessage pointer */
export const sendMessage = async (input: SendMessageInput): Promise<IMessage> => {
  const chat = await Chat.findById(input.chatId);
  if (!chat) throw new NotFoundError('Chat not found');

  const isMember = chat.participants.some((p) => p.equals(input.senderId));
  if (!isMember) throw new ForbiddenError('You are not a member of this chat');

  if (chat.isGroupChat) {
    const muteEntry = chat.mutedUsers.find((entry) => entry.user.equals(input.senderId));
    const muteStillActive = muteEntry && (!muteEntry.mutedUntil || muteEntry.mutedUntil > new Date());

    if (muteStillActive) {
      throw new ForbiddenError('You are muted in this group chat');
    }
  }

  const message = await Message.create({
    chat: input.chatId,
    sender: input.senderId,
    content: input.content,
    contentType: input.contentType ?? 'text',
    fileUrl: input.fileUrl ?? '',
    filePublicId: input.filePublicId ?? '',
    fileName: input.fileName ?? '',
    fileSize: input.fileSize ?? 0,
    mimeType: input.mimeType ?? '',
    isEncrypted: input.isEncrypted ?? false,
    encryptedFor: input.encryptedFor ?? {},
    replyTo: input.replyTo ? new Types.ObjectId(input.replyTo) : null,
  });

  // Keep lastMessage pointer up to date
  await Chat.findByIdAndUpdate(input.chatId, { lastMessage: message._id });

  // Create in-DB notifications for all other participants
  const recipients = chat.participants.filter((p) => !p.equals(input.senderId));
  const notifications = recipients.map((recipientId) => ({
    recipient: recipientId,
    sender: input.senderId,
    type: 'new_message' as const,
    chat: chat._id,
    message: message._id,
    content: `New message from ${input.senderId}`,
  }));
  if (notifications.length) await Notification.insertMany(notifications);

  void sendPushToUsers(recipients, {
    title: 'New message',
    body: input.content || input.fileName || 'Open chat to view',
    chatId: input.chatId,
  });

  return Message.findById(message._id).populate(MESSAGE_POPULATE) as Promise<IMessage>;
};

/** Paginated message history for a chat (cursor-based for large histories) */
export const getMessages = async (
  chatId: string,
  userId: Types.ObjectId,
  page: number,
  limit: number,
): Promise<PaginatedResult<IMessage>> => {
  const chat = await Chat.findById(chatId);
  if (!chat) throw new NotFoundError('Chat not found');

  const isMember = chat.participants.some((p) => p.equals(userId));
  if (!isMember) throw new ForbiddenError('You are not a member of this chat');

  const skip = (page - 1) * limit;

  const [messages, totalCount] = await Promise.all([
    Message.find({ chat: chatId, isDeleted: false })
      .sort({ createdAt: -1 }) // newest first, client reverses
      .skip(skip)
      .limit(limit)
      .populate(MESSAGE_POPULATE),
    Message.countDocuments({ chat: chatId, isDeleted: false }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  return {
    data: messages as IMessage[],
    totalCount,
    page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

/** Search messages for current user globally or within a single chat */
export const searchMessages = async (input: MessageSearchInput): Promise<IMessage[]> => {
  const query = input.query.trim();
  if (!query) return [];

  let chatFilter: Types.ObjectId[];

  if (input.chatId) {
    const chat = await Chat.findById(input.chatId).select('_id participants');
    if (!chat) throw new NotFoundError('Chat not found');

    const isMember = chat.participants.some((p) => p.equals(input.userId));
    if (!isMember) throw new ForbiddenError('You are not a member of this chat');

    chatFilter = [chat._id];
  } else {
    const chats = await Chat.find({ participants: input.userId }).select('_id');
    chatFilter = chats.map((chat) => chat._id);
  }

  if (!chatFilter.length) return [];

  const limit = Math.max(1, Math.min(100, input.limit ?? 30));
  const regex = new RegExp(query, 'i');

  const textResults = await Message.find({
    chat: { $in: chatFilter },
    isDeleted: false,
    $text: { $search: query },
  })
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .limit(limit)
    .populate(MESSAGE_POPULATE)
    .select({ score: { $meta: 'textScore' } });

  if (textResults.length > 0) return textResults as IMessage[];

  return Message.find({
    chat: { $in: chatFilter },
    isDeleted: false,
    $or: [{ content: regex }, { fileName: regex }],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate(MESSAGE_POPULATE) as Promise<IMessage[]>;
};

/** Soft-delete a message (only sender can delete) */
export const deleteMessage = async (
  messageId: string,
  userId: Types.ObjectId,
): Promise<IMessage> => {
  const message = await Message.findById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (!message.sender.equals(userId)) throw new ForbiddenError('Cannot delete another user\'s message');

  message.isDeleted = true;
  message.deletedAt = new Date();
  message.content = '';
  await message.save();

  return message;
};

/** Edit message text (only sender, only text messages, within 15 min) */
export const editMessage = async (
  messageId: string,
  userId: Types.ObjectId,
  newContent: string,
): Promise<IMessage> => {
  const message = await Message.findById(messageId);
  if (!message) throw new NotFoundError('Message not found');
  if (!message.sender.equals(userId)) throw new ForbiddenError('Cannot edit another user\'s message');
  if (message.contentType !== 'text') throw new ForbiddenError('Only text messages can be edited');

  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new ForbiddenError('Edit window (15 minutes) has passed');
  }

  message.originalContent = message.originalContent || message.content;
  message.content = newContent;
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  return Message.findById(messageId).populate(MESSAGE_POPULATE) as Promise<IMessage>;
};

/** Mark all unread messages in a chat as read for the current user */
export const markMessagesAsRead = async (
  chatId: string,
  userId: Types.ObjectId,
): Promise<MarkReadResult> => {
  const targets = await Message.find({
    chat: chatId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
    isDeleted: false,
  })
    .select('_id sender')
    .lean();

  if (!targets.length) {
    return { messageIds: [], senderIds: [] };
  }

  await Message.updateMany(
    { _id: { $in: targets.map((message) => message._id) } },
    {
      $addToSet: {
        readBy: { user: userId, readAt: new Date() },
        deliveredTo: userId,
      },
      $set: { status: 'read' },
    },
  );

  return {
    messageIds: targets.map((message) => message._id.toString()),
    senderIds: Array.from(new Set(targets.map((message) => message.sender.toString()))),
  };
};

/** Mark one message as delivered for the current user */
export const markMessageDelivered = async (
  messageId: string,
  userId: Types.ObjectId,
): Promise<MessageDeliveryResult | null> => {
  const message = await Message.findOneAndUpdate(
    {
      _id: messageId,
      sender: { $ne: userId },
      deliveredTo: { $ne: userId },
      isDeleted: false,
    },
    {
      $addToSet: { deliveredTo: userId },
      $set: { status: 'delivered' },
    },
    { new: true },
  ).select('_id chat sender');

  if (!message) return null;

  return {
    messageId: message._id.toString(),
    chatId: message.chat.toString(),
    senderId: message.sender.toString(),
  };
};

/** Return quick-reply suggestions based on recent incoming messages */
export const getSmartReplies = async (
  chatId: string,
  userId: Types.ObjectId,
): Promise<string[]> => {
  const chat = await Chat.findById(chatId).populate('participants', 'name');
  if (!chat) throw new NotFoundError('Chat not found');

  const isMember = chat.participants.some((participant: { _id: Types.ObjectId }) =>
    participant._id.equals(userId),
  );
  if (!isMember) throw new ForbiddenError('You are not a member of this chat');

  const latestIncoming = await Message.findOne({
    chat: chatId,
    sender: { $ne: userId },
    contentType: 'text',
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .select('content');

  if (!latestIncoming?.content) {
    return ['Sounds good', 'Thanks for the update', 'Let me check and reply'];
  }

  const text = latestIncoming.content.toLowerCase();
  if (text.includes('?')) return ['Yes, absolutely', 'Not yet, I am checking', 'Can we discuss this quickly?'];
  if (text.includes('meeting') || text.includes('call')) {
    return ['Works for me', 'Can we do 30 minutes later?', 'I will join'];
  }
  if (text.includes('urgent') || text.includes('asap')) {
    return ['On it', 'I will prioritize this now', 'Acknowledged, updating soon'];
  }

  return ['Great', 'Got it', 'Thanks, noted'];
};

/** Produce a lightweight chat summary from recent text messages */
export const summarizeChat = async (
  chatId: string,
  userId: Types.ObjectId,
): Promise<SmartSummary> => {
  const chat = await Chat.findById(chatId).populate('participants', 'name');
  if (!chat) throw new NotFoundError('Chat not found');

  const isMember = chat.participants.some((participant: { _id: Types.ObjectId }) =>
    participant._id.equals(userId),
  );
  if (!isMember) throw new ForbiddenError('You are not a member of this chat');

  const messages = await Message.find({
    chat: chatId,
    contentType: 'text',
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('sender', 'name')
    .select('content sender createdAt');

  const activeParticipants = Array.from(
    new Set(
      messages
        .map((message) => (message.sender as unknown as { name?: string })?.name)
        .filter((name): name is string => Boolean(name)),
    ),
  );

  const words = messages
    .flatMap((message) => message.content.split(/\s+/g))
    .map(sanitizeWord)
    .filter((word) => word.length > 3 && !['this', 'that', 'with', 'from', 'have', 'will'].includes(word));

  const frequency = words.reduce<Record<string, number>>((acc, word) => {
    acc[word] = (acc[word] ?? 0) + 1;
    return acc;
  }, {});

  const highlights = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => `Discussed: ${word}`);

  return {
    title: chat.isGroupChat ? `Summary for ${chat.name || 'group chat'}` : 'Direct chat summary',
    totalMessages: messages.length,
    activeParticipants,
    highlights: highlights.length ? highlights : ['No dominant discussion topics yet'],
  };
};

/** Count unread messages in a chat for a given user */
export const getUnreadCount = async (
  chatId: string,
  userId: Types.ObjectId,
): Promise<number> => {
  return Message.countDocuments({
    chat: chatId,
    sender: { $ne: userId },
    'readBy.user': { $ne: userId },
    isDeleted: false,
  });
};
