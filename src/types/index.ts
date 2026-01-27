
import { Request } from 'express';

export interface AuthRequest extends Request {
  userId?: string;
  email?: string;
}

export interface DreamValidationResponse {
  isValid: boolean;
  warnings: string[];
  suggestedCheckpoints: {
    title: string;
    description?: string;
    expectedEffort?: number;
    miniDeadline?: Date;
  }[];
}