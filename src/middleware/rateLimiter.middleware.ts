import rateLimit from 'express-rate-limit';
import { config } from '../config/env';
import { sendError } from '../utils/response';

/** General API rate limiter */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    sendError(res, 'Too many requests, please try again later.', 429);
  },
});

/** Stricter limiter for auth endpoints to prevent brute-force */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    sendError(res, 'Too many authentication attempts. Please try again in 15 minutes.', 429);
  },
});
