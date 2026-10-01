import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/auth';

export interface AuthedRequest extends Request {
  customer?: TokenPayload;
  admin?: TokenPayload;
}

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export function requireCustomer(req: AuthedRequest, res: Response, next: NextFunction): void {
  try {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    req.customer = verifyToken(token, 'customer');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalCustomer(req: AuthedRequest, _res: Response, next: NextFunction): void {
  try {
    const token = extractBearer(req);
    if (token) {
      req.customer = verifyToken(token, 'customer');
    }
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  try {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: 'Admin authentication required' });
      return;
    }
    req.admin = verifyToken(token, 'admin');
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}
