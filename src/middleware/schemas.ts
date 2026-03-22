import { z } from 'zod';

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be at most 50 characters')
    .trim(),
  email: z.string().email('Invalid email').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

export const accessChatSchema = z.object({
  userId: z.string().length(24, 'Invalid user ID'),
});

export const createGroupSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  participantIds: z
    .array(z.string().length(24))
    .min(2, 'Group needs at least 2 other participants'),
  description: z.string().max(500).optional(),
});

export const renameGroupSchema = z.object({
  name: z.string().min(2).max(100).trim(),
});

export const addParticipantsSchema = z.object({
  userIds: z.array(z.string().length(24)).min(1),
});

export const muteParticipantSchema = z.object({
  userId: z.string().length(24),
  minutes: z.number().int().min(1).max(10080).optional(),
  reason: z.string().max(200).optional(),
});

export const unmuteParticipantSchema = z.object({
  userId: z.string().length(24),
});

export const promoteAdminSchema = z.object({
  userId: z.string().length(24),
});

export const sendMessageSchema = z.object({
  content: z.string().max(5000).optional().default(''),
  replyTo: z.string().length(24).optional(),
  isEncrypted: z
    .union([z.boolean(), z.string().transform((value) => value === 'true')])
    .optional()
    .default(false),
  encryptedFor: z.string().optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(5000).trim(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(50).trim().optional(),
  bio: z.string().max(200).optional(),
  publicKey: z.string().max(2000).optional(),
});
