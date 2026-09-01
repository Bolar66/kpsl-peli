import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Token puuttuu' });
  }

  jwt.verify(token, process.env.JWT_SECRET!, (err: any, payload: any) => {
    if (err) {
      return res.status(403).json({ error: 'Virheellinen tai vanhentunut token' });
    }
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  });
}