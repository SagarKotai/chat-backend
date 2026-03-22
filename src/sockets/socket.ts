import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { verifyAccessToken } from '../utils/jwt';
import { setOnlineStatus } from '../services/user.service';
import { markMessageDelivered, markMessagesAsRead } from '../services/message.service';
import { Types } from 'mongoose';
import { Chat } from '../models/chat.model';

// Maps userId → Set of socket IDs (one user may have multiple tabs/devices)
const onlineUsers = new Map<string, Set<string>>();

/** Retrieve all currently connected socket IDs for a given userId */
export const getSocketIdsForUser = (userId: string): string[] => {
  return Array.from(onlineUsers.get(userId) ?? []);
};

export const initSocketIO = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, {
    cors: {
      origin: config.cors.clientUrl,
      credentials: true,
    },
    // Ping every 25 s, disconnect if no pong within 5 s — keeps connection lean
    pingInterval: 25000,
    pingTimeout: 5000,
  });

  // ─── JWT Authentication middleware ────────────────────────────────────────
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.headers?.authorization?.replace('Bearer ', '') as string | undefined);

    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = verifyAccessToken(token);
      // Attach user info to the socket instance for later use
      (socket as AuthenticatedSocket).userId = payload.userId;
      (socket as AuthenticatedSocket).userEmail = payload.email;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const userId = authSocket.userId;

    logger.debug(`Socket connected: ${socket.id} (user: ${userId})`);

    // ── Online presence ──────────────────────────────────────────────────────
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId)!.add(socket.id);

    // Mark online in DB + broadcast to everyone
    void setOnlineStatus(new Types.ObjectId(userId), true);
    io.emit('user:online', { userId });

    // ── Join personal notification room ──────────────────────────────────────
    void socket.join(`user:${userId}`);

    // ── Join all chat rooms for this user (multi-tab/device sync) ──────────
    void (async () => {
      const chats = await Chat.find({ participants: new Types.ObjectId(userId) }).select('_id').lean();
      for (const chat of chats) {
        await socket.join(`chat:${chat._id.toString()}`);
      }
      socket.emit('sync:required');
    })();

    // ── Join chat room ───────────────────────────────────────────────────────
    socket.on('chat:join', (chatId: string) => {
      void socket.join(`chat:${chatId}`);
      logger.debug(`User ${userId} joined chat room ${chatId}`);
    });

    socket.on('chat:leave', (chatId: string) => {
      void socket.leave(`chat:${chatId}`);
      logger.debug(`User ${userId} left chat room ${chatId}`);
    });

    // ── New message ──────────────────────────────────────────────────────────
    // REST API handles persistence; socket just broadcasts to room members.
    socket.on(
      'message:new',
      (payload: {
        chatId: string;
        message: unknown;
        recipientIds: string[];
      }) => {
        // Emit to everyone in the chat room except the sender
        socket.to(`chat:${payload.chatId}`).emit('message:new', payload.message);

        // Also push real-time notification to recipients who aren't in the room
        for (const recipientId of payload.recipientIds) {
          if (recipientId !== userId) {
            io.to(`user:${recipientId}`).emit('notification:new', {
              chatId: payload.chatId,
              message: payload.message,
            });
          }
        }
      },
    );

    // ── Typing indicators ────────────────────────────────────────────────────
    socket.on('typing:start', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId });
    });

    socket.on('typing:stop', (chatId: string) => {
      socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
    });

    // ── Message delivery status ──────────────────────────────────────────────
    socket.on(
      'message:delivered',
      async (payload: { messageId: string }) => {
        try {
          const result = await markMessageDelivered(payload.messageId, new Types.ObjectId(userId));
          if (!result) return;

          // Notify sender and other connected room participants about status update
          io.to(`user:${result.senderId}`).emit('message:delivered', {
            messageId: result.messageId,
            chatId: result.chatId,
            deliveredBy: userId,
          });
          socket.to(`chat:${result.chatId}`).emit('message:delivered', {
            messageId: result.messageId,
            chatId: result.chatId,
            deliveredBy: userId,
          });
        } catch (err) {
          logger.error('Error marking message delivered via socket', err);
        }
      },
    );

    socket.on(
      'message:read',
      async (payload: { chatId: string }) => {
        try {
          const result = await markMessagesAsRead(payload.chatId, new Types.ObjectId(userId));
          if (!result.messageIds.length) return;

          for (const senderId of result.senderIds) {
            io.to(`user:${senderId}`).emit('message:read', {
              chatId: payload.chatId,
              readBy: userId,
              messageIds: result.messageIds,
            });
          }

          socket.to(`chat:${payload.chatId}`).emit('message:read', {
            chatId: payload.chatId,
            readBy: userId,
            messageIds: result.messageIds,
          });
        } catch (err) {
          logger.error('Error marking messages as read via socket', err);
        }
      },
    );

    // ── Message edit/delete (real-time propagation) ──────────────────────────
    socket.on('message:edited', (payload: { chatId: string; message: unknown }) => {
      socket.to(`chat:${payload.chatId}`).emit('message:edited', payload.message);
    });

    socket.on('message:deleted', (payload: { chatId: string; messageId: string }) => {
      socket.to(`chat:${payload.chatId}`).emit('message:deleted', {
        messageId: payload.messageId,
        chatId: payload.chatId,
      });
    });

    // ── Group events ─────────────────────────────────────────────────────────
    socket.on('group:updated', (payload: { chatId: string; chat: unknown }) => {
      socket.to(`chat:${payload.chatId}`).emit('group:updated', payload.chat);
    });

    // ── WebRTC signaling (direct calls) ─────────────────────────────────────
    socket.on(
      'call:offer',
      (payload: { targetUserId: string; chatId: string; sdp: unknown; video: boolean }) => {
        io.to(`user:${payload.targetUserId}`).emit('call:offer', {
          fromUserId: userId,
          chatId: payload.chatId,
          sdp: payload.sdp,
          video: payload.video,
        });
      },
    );

    socket.on(
      'call:answer',
      (payload: { targetUserId: string; chatId: string; sdp: unknown }) => {
        io.to(`user:${payload.targetUserId}`).emit('call:answer', {
          fromUserId: userId,
          chatId: payload.chatId,
          sdp: payload.sdp,
        });
      },
    );

    socket.on(
      'call:ice-candidate',
      (payload: { targetUserId: string; chatId: string; candidate: unknown }) => {
        io.to(`user:${payload.targetUserId}`).emit('call:ice-candidate', {
          fromUserId: userId,
          chatId: payload.chatId,
          candidate: payload.candidate,
        });
      },
    );

    socket.on('call:end', (payload: { targetUserId: string; chatId: string }) => {
      io.to(`user:${payload.targetUserId}`).emit('call:end', {
        fromUserId: userId,
        chatId: payload.chatId,
      });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          // Last device disconnected — mark offline
          onlineUsers.delete(userId);
          try {
            await setOnlineStatus(new Types.ObjectId(userId), false);
          } catch (err) {
            logger.error('Error updating offline status', err);
          }
          io.emit('user:offline', { userId });
          logger.debug(`User ${userId} is now offline`);
        }
      }
    });
  });

  return io;
};

// Augment Socket type to include our custom properties
interface AuthenticatedSocket extends Socket {
  userId: string;
  userEmail: string;
}
