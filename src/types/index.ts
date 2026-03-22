import { Request } from 'express';
import { Types } from 'mongoose';

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user: {
    _id: Types.ObjectId;
    name: string;
    email: string;
    avatar?: string;
    publicKey?: string;
    isOnline: boolean;
  };
}

// ─── Token pair ─────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationQuery {
  page?: number;
  limit?: number;
  cursor?: string; // cursor-based paging for messages
}

export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// ─── Socket ──────────────────────────────────────────────────────────────────

export interface SocketUser {
  userId: string;
  socketId: string;
}

// ─── File upload ─────────────────────────────────────────────────────────────

export interface UploadedFile {
  url: string;
  publicId: string;
  fileType: 'image' | 'video' | 'audio' | 'document';
  mimeType: string;
  size: number;
  name: string;
}

// ─── API response ────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown;
}
