import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config/env';
import { JwtPayload, TokenPair } from '../types';

/** Sign a short-lived access token */
export const signAccessToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  } as jwt.SignOptions);
};

/** Sign a long-lived refresh token */
export const signRefreshToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
};

/** Verify an access token — throws on invalid/expired */
export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.jwt.accessSecret) as JwtPayload;
};

/** Verify a refresh token — throws on invalid/expired */
export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as JwtPayload;
};

/** Issue both tokens at once */
export const generateTokenPair = (payload: Omit<JwtPayload, 'iat' | 'exp'>): TokenPair => ({
  accessToken: signAccessToken(payload),
  refreshToken: signRefreshToken(payload),
});

/** Hash a refresh token before storing in DB */
export const hashToken = async (token: string): Promise<string> => {
  return bcrypt.hash(token, 10);
};

/** Compare a raw token against a stored hash */
export const compareToken = async (token: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(token, hash);
};
