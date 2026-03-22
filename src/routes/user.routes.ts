import { Router } from 'express';
import * as userController from '../controllers/user.controller';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { updateProfileSchema } from '../middleware/schemas';
import { upload } from '../utils/upload';

const router = Router();

// All user routes require authentication
router.use(protect);

// GET  /api/users/search?q=<query>
router.get('/search', userController.searchUsers);

// GET  /api/users/me
router.get('/me', userController.getCurrentUser);

// PATCH /api/users/me  — update profile (optionally upload avatar)
router.patch(
  '/me',
  upload.single('avatar'),
  validate(updateProfileSchema),
  userController.updateProfile,
);

// GET /api/users/me/e2ee-keys
router.get('/me/e2ee-keys', userController.getE2EEKeys);

// POST /api/users/me/e2ee-keys
router.post('/me/e2ee-keys', userController.upsertE2EEKey);

// DELETE /api/users/me/e2ee-keys/:deviceId
router.delete('/me/e2ee-keys/:deviceId', userController.revokeE2EEKey);

// GET  /api/users/:id  — view other user's public profile
router.get('/:id', userController.getUserProfile);

export default router;
