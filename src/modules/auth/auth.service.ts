import prisma from '../../config/database';
import {
  hashPassword,
  verifyPassword,
  generateToken,
} from './auth.utils';
import { logger } from '../../utils/logger';
import {
  AuthError,
  ConflictError,
  ValidationError,
} from '../../utils/errors';
import { validateEmail, validatePassword } from '../../utils/validators';
import { SignupRequest, LoginRequest, AuthResponse } from './auth.dto';
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

    const token = generateToken(user.id, user.email);

    await logger.info('auth', 'User signed up', { userId: user.id, email });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
      },
      token,
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

    const token = generateToken(user.id, user.email);

    await logger.info('auth', 'User logged in', { userId: user.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        timezone: user.timezone,
      },
      token,
    };
  }
}

export const authService = new AuthService();