import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { config } from '../config/env';

/**
 * Central error-handling middleware.
 * Must be registered LAST in Express middleware chain.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Operational (known) errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[AppError] ${err.message}`, { stack: err.stack });
    } else {
      logger.warn(`[AppError] ${err.message}`);
    }
    sendError(res, err.message, err.statusCode);
    return;
  }

  // Mongoose duplicate key
  if ((err as NodeJS.ErrnoException).code === '11000') {
    const match = err.message.match(/index: (\w+)_\d/);
    const field = match ? match[1] : 'field';
    sendError(res, `${field} already exists`, 409);
    return;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    sendError(res, err.message, 422);
    return;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    sendError(res, 'Invalid token', 401);
    return;
  }
  if (err.name === 'TokenExpiredError') {
    sendError(res, 'Token expired', 401);
    return;
  }

  // Unknown / programmer errors
  logger.error(`[Unhandled] ${err.message}`, { stack: err.stack });
  const message = config.isDev ? err.message : 'Something went wrong';
  sendError(res, message, 500);
};

/** 404 handler — must be registered before errorHandler */
export const notFound = (req: Request, _res: Response, next: NextFunction): void => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
};
