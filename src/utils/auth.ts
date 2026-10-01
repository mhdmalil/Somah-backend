import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const BCRYPT_ROUNDS = 12;

export type ActorType = 'customer' | 'admin';

export interface TokenPayload {
  sub: string;
  type: ActorType;
  email: string;
  role?: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function secretFor(type: ActorType): string {
  return type === 'admin' ? env.jwtAdminSecret : env.jwtCustomerSecret;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, secretFor(payload.type), {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

export function verifyToken(token: string, expectedType: ActorType): TokenPayload {
  const decoded = jwt.verify(token, secretFor(expectedType)) as TokenPayload;
  if (decoded.type !== expectedType) {
    throw new Error('Invalid token type');
  }
  return decoded;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}
