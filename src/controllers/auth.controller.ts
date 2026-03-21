import { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service';
import { sendSuccess, setRefreshCookie, clearRefreshCookie } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { UnauthorizedError } from '../utils/errors';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user, tokens } = await authService.registerUser(req.body);
    setRefreshCookie(res, tokens.refreshToken);
    sendSuccess(res, { user, accessToken: tokens.accessToken }, 'Registration successful', 201);
  } catch (err) {
    next(err);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user, tokens } = await authService.loginUser(req.body);
    setRefreshCookie(res, tokens.refreshToken);
    sendSuccess(res, { user, accessToken: tokens.accessToken }, 'Login successful');
  } catch (err) {
    next(err);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Read from httpOnly cookie
    const rawToken = req.cookies?.refreshToken as string | undefined;
    if (!rawToken) throw new UnauthorizedError('Refresh token missing');

    const tokens = await authService.refreshTokens(rawToken);
    setRefreshCookie(res, tokens.refreshToken);
    sendSuccess(res, { accessToken: tokens.accessToken }, 'Token refreshed');
  } catch (err) {
    next(err);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawToken = req.cookies?.refreshToken as string | undefined;
    if (!rawToken) throw new UnauthorizedError('Not logged in');

    const authReq = req as AuthenticatedRequest;
    await authService.logoutUser(authReq.user._id, rawToken);
    clearRefreshCookie(res);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    next(err);
  }
};

export const getMe = (req: Request, res: Response) => {
  sendSuccess(res, (req as AuthenticatedRequest).user, 'Current user');
};
