import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';
import { User } from '../models/user.model';
import { AuthenticatedRequest } from '../types';

/**
 * Protect routes — validates the Bearer access token and attaches req.user.
 */
export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token required');
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.userId).select('-password -refreshTokens');
    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }

    (req as AuthenticatedRequest).user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      isOnline: user.isOnline,
    };

    next();
  } catch (error) {
    next(error);
  }
};
