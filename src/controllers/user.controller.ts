import { Request, Response, NextFunction } from 'express';
import * as userService from '../services/user.service';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { uploadToCloudinary } from '../utils/upload';
import { BadRequestError } from '../utils/errors';

export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUserById((req as AuthenticatedRequest).user._id.toString());
    sendSuccess(res, user, 'User profile');
  } catch (err) {
    next(err);
  }
};

export const getUserProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUserById(req.params.id);
    sendSuccess(res, user, 'User profile');
  } catch (err) {
    next(err);
  }
};

export const searchUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query.trim()) {
      sendSuccess(res, [], 'No query provided');
      return;
    }
    const users = await userService.searchUsers(query, (req as AuthenticatedRequest).user._id);
    sendSuccess(res, users, 'Search results');
  } catch (err) {
    next(err);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { name, bio } = req.body as { name?: string; bio?: string };

    let avatarUrl: string | undefined;

    // Handle avatar upload if a file was provided
    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) {
        throw new BadRequestError('Avatar must be an image');
      }
      const uploaded = await uploadToCloudinary(
        req.file.buffer,
        'chat-app/avatars',
        req.file.mimetype,
        req.file.originalname,
      );
      avatarUrl = uploaded.url;
    }

    const updated = await userService.updateProfile(authReq.user._id, {
      name,
      bio,
      ...(avatarUrl ? { avatar: avatarUrl } : {}),
    });

    sendSuccess(res, updated, 'Profile updated');
  } catch (err) {
    next(err);
  }
};
