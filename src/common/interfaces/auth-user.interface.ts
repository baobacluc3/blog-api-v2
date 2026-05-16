import { Role } from '../enums/role.enum';

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  username?: string;
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
  username?: string;
}
