import { Response } from 'express';
import { ApiResponse } from '../types';

/** Send a standardised success response */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
): Response => {
  const body: ApiResponse<T> = { success: true, message, data };
  return res.status(statusCode).json(body);
};

/** Send a standardised error response */
export const sendError = (
  res: Response,
  message: string,
  statusCode = 500,
  errors?: unknown,
): Response => {
  const body: ApiResponse = { success: false, message, errors };
  return res.status(statusCode).json(body);
};

/** Set refresh-token httpOnly cookie */
export const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth',
  });
};

/** Clear the refresh-token cookie */
export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
};
