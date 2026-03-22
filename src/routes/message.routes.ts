import { Router } from 'express';
import * as messageController from '../controllers/message.controller';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { sendMessageSchema, editMessageSchema } from '../middleware/schemas';
import { upload } from '../utils/upload';

const router = Router();

router.use(protect);

// GET  /api/messages/search/all?q=...&chatId=...&limit=... — search messages
router.get('/search/all', messageController.searchMessages);

// GET  /api/messages/:chatId/smart-replies — heuristic smart reply suggestions
router.get('/:chatId/smart-replies', messageController.getSmartReplies);

// GET  /api/messages/:chatId/summary — lightweight chat summarization
router.get('/:chatId/summary', messageController.getChatSummary);

// POST /api/messages/:chatId        — send a message (text or file)
router.post(
  '/:chatId',
  upload.single('file'),
  validate(sendMessageSchema),
  messageController.sendMessage,
);

// GET  /api/messages/:chatId        — paginated message history
router.get('/:chatId', messageController.getMessages);

// PATCH /api/messages/:id/read/all  — mark all messages in chat as read
router.patch('/:chatId/read/all', messageController.markAsRead);

// PATCH /api/messages/:id           — edit a message
router.patch('/:id', validate(editMessageSchema), messageController.editMessage);

// DELETE /api/messages/:id          — soft-delete a message
router.delete('/:id', messageController.deleteMessage);

export default router;
