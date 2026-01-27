import jwt from 'jsonwebtoken';
// @ts-ignore
import bcrypt from 'bcrypt';
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

export const generateToken = (userId: string, email: string): string => {
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-prod';
  const jwtExpiry = process.env.JWT_EXPIRY || '1h';
  
  return jwt.sign({ userId, email }, jwtSecret as string, {
    expiresIn: jwtExpiry as string,
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): { userId: string; email: string } => {
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-prod';
  
  try {
    return jwt.verify(token, jwtSecret) as {
      userId: string;
      email: string;
    };
  } catch {
    throw new Error('Invalid token');
  }
};