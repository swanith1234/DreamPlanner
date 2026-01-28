export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  timezone?: string;
  userAgent?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  userAgent?: string;
}

export interface RefreshRequest {
  refreshToken: string;
  userAgent?: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    timezone: string;
  };
  accessToken: string;
  refreshToken: string;
}