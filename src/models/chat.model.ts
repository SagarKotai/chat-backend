import { Schema, model, Document, Types } from 'mongoose';

export interface IChat extends Document {
  _id: Types.ObjectId;
  isGroupChat: boolean;
  name: string; // for group chats
  participants: Types.ObjectId[];
  admin: Types.ObjectId; // group admin
  groupAdmins: Types.ObjectId[]; // multiple admins support
  avatar: string; // group avatar
  description: string; // group description
  lastMessage: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema<IChat>(
  {
    isGroupChat: {
      type: Boolean,
      default: false,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    // Primary admin (creator)
    admin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    // All users with admin privileges in the group
    groupAdmins: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    avatar: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      maxlength: 500,
      default: '',
    },
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
// Quickly find all chats for a given user
chatSchema.index({ participants: 1 });
// Unique 1-to-1 chat lookup (two participants, not a group)
chatSchema.index({ participants: 1, isGroupChat: 1 });

export const Chat = model<IChat>('Chat', chatSchema);
