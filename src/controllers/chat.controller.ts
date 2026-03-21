import { Request, Response, NextFunction } from 'express';
import * as chatService from '../services/chat.service';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { uploadToCloudinary } from '../utils/upload';

export const accessOrCreateChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const chat = await chatService.accessOrCreateChat(authReq.user._id, req.body.userId);
    sendSuccess(res, chat, 'Chat accessed');
  } catch (err) {
    next(err);
  }
};

export const getUserChats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chats = await chatService.getUserChats((req as AuthenticatedRequest).user._id);
    sendSuccess(res, chats, 'Chats retrieved');
  } catch (err) {
    next(err);
  }
};

export const getChatById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await chatService.getChatById(req.params.id, (req as AuthenticatedRequest).user._id);
    sendSuccess(res, chat, 'Chat retrieved');
  } catch (err) {
    next(err);
  }
};

export const createGroupChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;

    let avatarUrl: string | undefined;
    if (req.file) {
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        'chat-app/groups',
        req.file.mimetype,
        req.file.originalname,
      );
      avatarUrl = uploaded.url;
    }

    const { name, participantIds, description } = req.body as {
      name: string;
      participantIds: string[];
      description?: string;
    };

    const chat = await chatService.createGroupChat(authReq.user._id, {
      name,
      participantIds,
      description,
      avatar: avatarUrl,
    });
    sendSuccess(res, chat, 'Group chat created', 201);
  } catch (err) {
    next(err);
  }
};

export const renameGroupChat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await chatService.renameGroupChat(
      req.params.id,
      req.body.name,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, chat, 'Group renamed');
  } catch (err) {
    next(err);
  }
};

export const addParticipants = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await chatService.addParticipants(
      req.params.id,
      req.body.userIds,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, chat, 'Participants added');
  } catch (err) {
    next(err);
  }
};

export const removeParticipant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await chatService.removeParticipant(
      req.params.id,
      req.params.userId,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, chat, 'Participant removed');
  } catch (err) {
    next(err);
  }
};

export const promoteToAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const chat = await chatService.promoteToAdmin(
      req.params.id,
      req.body.userId,
      (req as AuthenticatedRequest).user._id,
    );
    sendSuccess(res, chat, 'User promoted to admin');
  } catch (err) {
    next(err);
  }
};
