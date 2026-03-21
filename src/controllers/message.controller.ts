import { Request, Response, NextFunction } from 'express';
import * as messageService from '../services/message.service';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { uploadToCloudinary } from '../utils/upload';

export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { content, replyTo } = req.body as { content?: string; replyTo?: string };

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
      ...fileData,
    });

    sendSuccess(res, message, 'Message sent', 201);
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
    await messageService.markMessagesAsRead(
      req.params.chatId,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, null, 'Messages marked as read');
  } catch (err) {
    next(err);
  }
};
