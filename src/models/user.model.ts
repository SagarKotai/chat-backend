import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IE2EEDeviceKey {
  deviceId: string;
  publicKey: string;
  createdAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
}

export interface IWebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent: string;
  createdAt: Date;
  lastUsedAt: Date;
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  avatar: string;
  bio: string;
  publicKey: string;
  e2eeKeys: IE2EEDeviceKey[];
  pushSubscriptions: IWebPushSubscription[];
  isOnline: boolean;
  lastSeen: Date;
  refreshTokens: string[]; // stored hashed
  createdAt: Date;
  updatedAt: Date;

  // instance methods
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // excluded from queries by default
    },
    avatar: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      maxlength: 200,
      default: '',
    },
    publicKey: {
      type: String,
      default: '',
    },
    e2eeKeys: {
      type: [
        {
          deviceId: { type: String, required: true },
          publicKey: { type: String, required: true },
          createdAt: { type: Date, default: Date.now },
          lastUsedAt: { type: Date, default: Date.now },
          revokedAt: { type: Date, default: null },
        },
      ],
      default: [],
      select: false,
    },
    pushSubscriptions: {
      type: [
        {
          endpoint: { type: String, required: true },
          keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true },
          },
          userAgent: { type: String, default: '' },
          createdAt: { type: Date, default: Date.now },
          lastUsedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
      select: false,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    // Hashed refresh tokens — supports multiple devices
    refreshTokens: {
      type: [String],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    // Strip password & refreshTokens from JSON serialisation by default
    toJSON: {
      transform(_doc, ret) {
        const safeRet = ret as {
          password?: string;
          refreshTokens?: string[];
          pushSubscriptions?: IWebPushSubscription[];
        };
        delete safeRet.password;
        delete safeRet.refreshTokens;
        delete safeRet.pushSubscriptions;
        return ret;
      },
    },
  },
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
userSchema.index({ name: 'text', email: 'text' }); // full-text search

// ─── Hooks ───────────────────────────────────────────────────────────────────
userSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─── Instance methods ────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User = model<IUser>('User', userSchema);
