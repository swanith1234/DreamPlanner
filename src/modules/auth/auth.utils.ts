import jwt from 'jsonwebtoken';
// @ts-ignore
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { env } from '../../config/env';

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10);
};

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateTokens = (userId: string, email: string) => {
  const jwtSecret = env.auth.jwtSecret || 'secret'; // Use env config

  const accessToken = jwt.sign({ userId, email }, jwtSecret, {
    expiresIn: '15m', // Short lived
  });

  const refreshToken = crypto.randomBytes(40).toString('hex');

  return { accessToken, refreshToken };
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const verifyAccessToken = (token: string): { userId: string; email: string } => {
  const jwtSecret = env.auth.jwtSecret || 'secret';

  try {
    return jwt.verify(token, jwtSecret) as {
      userId: string;
      email: string;
    };
  } catch {
    throw new Error('Invalid token');
  }
};