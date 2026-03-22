import { Request, Response, NextFunction } from 'express';
import * as messageService from '../services/message.service';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { uploadToCloudinary } from '../utils/upload';

export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { content, replyTo, isEncrypted, encryptedFor } = req.body as {
      content?: string;
      replyTo?: string;
      isEncrypted?: boolean;
      encryptedFor?: string;
    };

    let encryptedMap: Record<string, string> | undefined;
    if (encryptedFor) {
      try {
        encryptedMap = JSON.parse(encryptedFor) as Record<string, string>;
      } catch {
        encryptedMap = undefined;
      }
    }

    let fileData = {};
    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        'chat-app/messages',
        req.file.mimetype,
        req.file.originalname,
      );
      fileData = {
        fileUrl: uploaded.url,
        filePublicId: uploaded.publicId,
        fileName: uploaded.name,
        fileSize: uploaded.size,
        mimeType: uploaded.mimeType,
        contentType: uploaded.fileType,
      };
    }

    const message = await messageService.sendMessage({
      chatId: req.params.chatId,
      senderId: authReq.user._id,
      content: content ?? '',
      replyTo,
      isEncrypted,
      encryptedFor: encryptedMap,
      ...fileData,
    });

    sendSuccess(res, message, 'Message sent', 201);
  } catch (err) {
    next(err);
  }
};

export const getSmartReplies = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const replies = await messageService.getSmartReplies(
      req.params.chatId,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, replies, 'Smart replies generated');
  } catch (err) {
    next(err);
  }
};

export const getChatSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await messageService.summarizeChat(
      req.params.chatId,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, summary, 'Chat summary generated');
  } catch (err) {
    next(err);
  }
};

export const getMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = req.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const limit = Math.min(100, parseInt(query.limit ?? '30', 10));

    const result = await messageService.getMessages(req.params.chatId, authReq.user._id, page, limit);
    sendSuccess(res, result, 'Messages retrieved');
  } catch (err) {
    next(err);
  }
};

export const searchMessages = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const query = (req.query.q as string) ?? '';
    const chatId = req.query.chatId as string | undefined;
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '30', 10)));

    if (!query.trim()) {
      sendSuccess(res, [], 'No query provided');
      return;
    }

    const messages = await messageService.searchMessages({
      query,
      chatId,
      limit,
      userId: authReq.user._id,
    });

    sendSuccess(res, messages, 'Message search results');
  } catch (err) {
    next(err);
  }
};

export const deleteMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const message = await messageService.deleteMessage(
      req.params.id,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, message, 'Message deleted');
  } catch (err) {
    next(err);
  }
};

export const editMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content } = req.body as { content: string };
    const message = await messageService.editMessage(
      req.params.id,
      (req as AuthenticatedRequest).user._id,
      content,
    );
    sendSuccess(res, message, 'Message edited');
  } catch (err) {
    next(err);
  }
};

export const markAsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await messageService.markMessagesAsRead(
      req.params.chatId,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, result, 'Messages marked as read');
  } catch (err) {
    next(err);
  }
};
