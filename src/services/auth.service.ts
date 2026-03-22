import { Types } from 'mongoose';
import { User } from '../models/user.model';
import {
  generateTokenPair,
  hashToken,
  compareToken,
  verifyRefreshToken,
} from '../utils/jwt';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../utils/errors';
import { TokenPair } from '../types';

interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface PublicUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  avatar: string;
  bio: string;
  publicKey: string;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

/** Register a new user, return user + token pair */
export const registerUser = async (input: RegisterInput): Promise<AuthResult> => {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) throw new ConflictError('Email already registered');

  const user = await User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    password: input.password,
  });

  const tokens = generateTokenPair({ userId: user._id.toString(), email: user.email });
  const hashedRefresh = await hashToken(tokens.refreshToken);

  // Store hashed refresh token (supports multi-device logins)
  await User.findByIdAndUpdate(user._id, {
    $push: { refreshTokens: hashedRefresh },
  });

  return { user: user.toJSON() as unknown as PublicUser, tokens };
};

/** Log in an existing user */
export const loginUser = async (input: LoginInput): Promise<AuthResult> => {
  // Explicitly select password (excluded by default via schema)
  const user = await User.findOne({ email: input.email.toLowerCase() }).select(
    '+password +refreshTokens',
  );

  if (!user) throw new UnauthorizedError('Invalid email or password');

  const isMatch = await user.comparePassword(input.password);
  if (!isMatch) throw new UnauthorizedError('Invalid email or password');

  const tokens = generateTokenPair({ userId: user._id.toString(), email: user.email });
  const hashedRefresh = await hashToken(tokens.refreshToken);

  // Limit stored refresh tokens to 5 (prevents unbounded growth)
  const tokens_list = user.refreshTokens ?? [];
  if (tokens_list.length >= 5) tokens_list.shift();
  tokens_list.push(hashedRefresh);

  await User.findByIdAndUpdate(user._id, { refreshTokens: tokens_list });

  // Mark online
  await User.findByIdAndUpdate(user._id, { isOnline: true });

  return { user: user.toJSON() as unknown as PublicUser, tokens };
};

/** Rotate a refresh token — old one is invalidated */
export const refreshTokens = async (rawToken: string): Promise<TokenPair> => {
  let payload;
  try {
    payload = verifyRefreshToken(rawToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.userId).select('+refreshTokens');
  if (!user) throw new NotFoundError('User not found');

  // Find matching hash among stored tokens
  let matchIndex = -1;
  for (let i = 0; i < user.refreshTokens.length; i++) {
    const match = await compareToken(rawToken, user.refreshTokens[i]);
    if (match) {
      matchIndex = i;
      break;
    }
  }

  if (matchIndex === -1) {
    // Token reuse detected — invalidate ALL sessions for this user
    await User.findByIdAndUpdate(user._id, { refreshTokens: [] });
    throw new UnauthorizedError('Refresh token reuse detected. All sessions invalidated.');
  }

  const newTokens = generateTokenPair({ userId: user._id.toString(), email: user.email });
  const newHashedRefresh = await hashToken(newTokens.refreshToken);

  // Replace old with new (rotation)
  user.refreshTokens[matchIndex] = newHashedRefresh;
  await User.findByIdAndUpdate(user._id, { refreshTokens: user.refreshTokens });

  return newTokens;
};

/** Log out — remove the specific refresh token */
export const logoutUser = async (
  userId: Types.ObjectId,
  rawToken: string,
): Promise<void> => {
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return;

  const updated: string[] = [];
  for (const hash of user.refreshTokens) {
    const match = await compareToken(rawToken, hash);
    if (!match) updated.push(hash);
  }

  await User.findByIdAndUpdate(userId, {
    refreshTokens: updated,
    isOnline: false,
    lastSeen: new Date(),
  });
};
