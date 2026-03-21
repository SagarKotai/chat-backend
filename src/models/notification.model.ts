import { Schema, model, Document, Types } from 'mongoose';

export type NotificationType =
  | 'new_message'
  | 'group_invite'
  | 'added_to_group'
  | 'removed_from_group'
  | 'group_admin_promoted';

export interface INotification extends Document {
  _id: Types.ObjectId;
  recipient: Types.ObjectId;
  sender: Types.ObjectId;
  type: NotificationType;
  chat: Types.ObjectId | null;
  message: Types.ObjectId | null;
  content: string; // human-readable notification text
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'new_message',
        'group_invite',
        'added_to_group',
        'removed_from_group',
        'group_admin_promoted',
      ],
      required: true,
    },
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      default: null,
    },
    message: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    content: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Compound index: fetch all unread notifications for a user quickly
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

export const Notification = model<INotification>('Notification', notificationSchema);
