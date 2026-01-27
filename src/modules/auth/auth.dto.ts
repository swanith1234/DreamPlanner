export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  timezone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    timezone: string;
  };
  token: string;
}