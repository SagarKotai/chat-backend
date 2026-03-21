import { Types } from 'mongoose';
import { Message, IMessage } from '../models/message.model';
import { Chat } from '../models/chat.model';
import { Notification } from '../models/notification.model';
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
}

const MESSAGE_POPULATE = [
  { path: 'sender', select: 'name avatar email' },
  { path: 'replyTo', populate: { path: 'sender', select: 'name avatar' } },
];

/** Send a new message and update the chat's lastMessage pointer */
export const sendMessage = async (input: SendMessageInput): Promise<IMessage> => {
  const chat = await Chat.findById(input.chatId);
  if (!chat) throw new NotFoundError('Chat not found');

  const isMember = chat.participants.some((p) => p.equals(input.senderId));
  if (!isMember) throw new ForbiddenError('You are not a member of this chat');

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
): Promise<void> => {
  await Message.updateMany(
    {
      chat: chatId,
      sender: { $ne: userId },
      'readBy.user': { $ne: userId },
      isDeleted: false,
    },
    {
      $push: { readBy: { user: userId, readAt: new Date() } },
      $set: { status: 'read' },
    },
  );
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
