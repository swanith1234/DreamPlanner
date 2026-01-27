export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public context?: any
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: any) {
    super(400, message, context);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}