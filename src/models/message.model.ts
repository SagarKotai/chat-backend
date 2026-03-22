import { Schema, model, Document, Types } from 'mongoose';

export type MessageContentType = 'text' | 'image' | 'video' | 'audio' | 'document';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface IMessageReadReceipt {
  user: Types.ObjectId;
  readAt: Date;
}

export interface IMessage extends Document {
  _id: Types.ObjectId;
  chat: Types.ObjectId;
  sender: Types.ObjectId;
  content: string; // text content
  contentType: MessageContentType;

  // For media messages
  fileUrl: string;
  filePublicId: string; // cloudinary public_id for deletion
  fileName: string;
  fileSize: number;
  mimeType: string;

  // Optional client-side encrypted payload per recipient userId
  isEncrypted: boolean;
  encryptedFor: Record<string, string>;

  // Delivery receipts per user
  readBy: IMessageReadReceipt[];
  deliveredTo: Types.ObjectId[];

  status: MessageStatus; // overall status (lowest common denominator)

  // Optional reply-to
  replyTo: Types.ObjectId | null;

  // Soft delete
  isDeleted: boolean;
  deletedAt: Date | null;

  // Edit history
  isEdited: boolean;
  editedAt: Date | null;
  originalContent: string;

  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      default: '',
    },
    contentType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document'],
      default: 'text',
    },
    fileUrl: { type: String, default: '' },
    filePublicId: { type: String, default: '' },
    fileName: { type: String, default: '' },
    fileSize: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
    isEncrypted: { type: Boolean, default: false },
    encryptedFor: { type: Schema.Types.Mixed, default: {} },

    readBy: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    deliveredTo: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },

    replyTo: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },

    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    originalContent: { type: String, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Fetch messages for a chat, sorted by creation time (most common query)
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ content: 'text', fileName: 'text' });

export const Message = model<IMessage>('Message', messageSchema);
