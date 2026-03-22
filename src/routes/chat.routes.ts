import { Router } from 'express';
import * as chatController from '../controllers/chat.controller';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  accessChatSchema,
  createGroupSchema,
  renameGroupSchema,
  addParticipantsSchema,
  promoteAdminSchema,
  muteParticipantSchema,
  unmuteParticipantSchema,
} from '../middleware/schemas';
import { upload } from '../utils/upload';

const router = Router();

router.use(protect);

// POST /api/chats           — access or create 1-to-1 chat
router.post('/', validate(accessChatSchema), chatController.accessOrCreateChat);

// GET  /api/chats           — list all chats for the current user
router.get('/', chatController.getUserChats);

// GET  /api/chats/search/groups?q=... — search group chats
router.get('/search/groups', chatController.searchGroupChats);

// GET  /api/chats/:id       — get a specific chat
router.get('/:id', chatController.getChatById);

// POST /api/chats/group     — create a group chat
router.post(
  '/group',
  upload.single('avatar'),
  validate(createGroupSchema),
  chatController.createGroupChat,
);

// PATCH /api/chats/:id/rename
router.patch('/:id/rename', validate(renameGroupSchema), chatController.renameGroupChat);

// PUT /api/chats/:id/participants — add participants to a group
router.put(
  '/:id/participants',
  validate(addParticipantsSchema),
  chatController.addParticipants,
);

// DELETE /api/chats/:id/participants/:userId — remove a participant
router.delete('/:id/participants/:userId', chatController.removeParticipant);

// PATCH /api/chats/:id/admin — promote member to admin
router.patch('/:id/admin', validate(promoteAdminSchema), chatController.promoteToAdmin);

// PATCH /api/chats/:id/mute — mute a participant (group admins)
router.patch('/:id/mute', validate(muteParticipantSchema), chatController.muteParticipant);

// PATCH /api/chats/:id/unmute — remove mute from participant
router.patch('/:id/unmute', validate(unmuteParticipantSchema), chatController.unmuteParticipant);

export default router;
