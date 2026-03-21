import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authLimiter } from '../middleware/rateLimiter.middleware';
import { registerSchema, loginSchema } from '../middleware/schemas';

const router = Router();

// POST /api/auth/register
router.post('/register', authLimiter, validate(registerSchema), authController.register);

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema), authController.login);

// POST /api/auth/refresh — uses httpOnly cookie
router.post('/refresh', authController.refresh);

// POST /api/auth/logout  (protected)
router.post('/logout', protect, authController.logout);

// GET  /api/auth/me      (protected)
router.get('/me', protect, authController.getMe);

export default router;
