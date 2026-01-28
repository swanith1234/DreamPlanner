import prisma from '../../config/database';
import {
  hashPassword,
  verifyPassword,
  generateTokens,
  hashToken,
} from './auth.utils';
import { logger } from '../../utils/logger';
import {
  AuthError,
  ConflictError,
  ValidationError,
} from '../../utils/errors';
import { validateEmail, validatePassword } from '../../utils/validators';
import { SignupRequest, LoginRequest, AuthResponse, RefreshRequest } from './auth.dto';
import { MotivationTone } from '@prisma/client';

export class AuthService {
  async signup(input: SignupRequest): Promise<AuthResponse> {
    const { name, email, password, timezone = 'UTC' } = input;

    // Validation
    if (!validateEmail(email)) {
      throw new ValidationError('Invalid email format');
    }
    if (!validatePassword(password)) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictError('User already exists');
    }

    // Create user and preferences
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        timezone,
        preferences: {
          create: {
            motivationTone: MotivationTone.NEUTRAL,
            notificationFrequency: 1, // 1 hour default
            sleepStart: '23:30',
            sleepEnd: '06:30',
            quietHours: [
              { start: '07:00', end: '09:00' },
              { start: '19:00', end: '21:00' },
            ],
          },
        },
      },
      include: { preferences: true },
    });

    const { accessToken, refreshToken } = generateTokens(user.id, user.email);
    await this.addRefreshTokenToWhitelist({
      userId: user.id,
      refreshToken,
      userAgent: input.userAgent
    });

    await logger.info('auth', 'User signed up', { userId: user.id, email });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
      },
      accessToken,
      refreshToken,
    };
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const { email, password } = input;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AuthError('Invalid credentials');
    }

    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthError('Invalid credentials');
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.email);
    await this.addRefreshTokenToWhitelist({
      userId: user.id,
      refreshToken,
      userAgent: input.userAgent || 'Unknown'
    });

    await logger.info('auth', 'User logged in', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
      },
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(input: RefreshRequest): Promise<{ accessToken: string; refreshToken: string }> {
    const { refreshToken } = input;
    const hashedToken = hashToken(refreshToken);

    const savedToken = await prisma.refreshToken.findUnique({
      where: { token: hashedToken },
      include: { user: true }
    });

    if (!savedToken || savedToken.revoked || new Date() > savedToken.expiresAt) {
      throw new AuthError('Invalid refresh token');
    }

    // Token Rotation: Delete consumed token
    await prisma.refreshToken.update({
      where: { id: savedToken.id },
      data: { revoked: true }
    });

    // Generate new pair
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(savedToken.user.id, savedToken.user.email);

    await this.addRefreshTokenToWhitelist({
      userId: savedToken.user.id,
      refreshToken: newRefreshToken,
      userAgent: input.userAgent || savedToken.deviceInfo || 'Unknown'
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    const hashedToken = hashToken(refreshToken);
    await prisma.refreshToken.update({
      where: { token: hashedToken },
      data: { revoked: true }
    });
  }

  // Helper
  private async addRefreshTokenToWhitelist({ userId, refreshToken, userAgent }: { userId: string, refreshToken: string, userAgent?: string }) {
    const hashedToken = hashToken(refreshToken);
    // Expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.refreshToken.create({
      data: {
        token: hashedToken,
        userId,
        expiresAt,
        deviceInfo: userAgent
      }
    });
  }
}

export const authService = new AuthService();