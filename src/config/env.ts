import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Validated environment configuration.
 * Throws at startup if critical variables are missing.
 */
const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const config = {
  env: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  port: parseInt(process.env.PORT || '5000', 10),

  db: {
    uri: requireEnv('MONGODB_URI'),
  },

  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },

  cors: {
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  },

  rtc: {
    turnUrl: process.env.TURN_URL || '',
    turnUsername: process.env.TURN_USERNAME || '',
    turnCredential: process.env.TURN_CREDENTIAL || '',
  },

  webPush: {
    enabled:
      Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY) &&
      Boolean(process.env.WEB_PUSH_VAPID_PRIVATE_KEY) &&
      Boolean(process.env.WEB_PUSH_SUBJECT),
    vapidPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '',
    subject: process.env.WEB_PUSH_SUBJECT || '',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production',
};
