import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
      };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Authentication middleware
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Add user to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
    };

    next();
  } catch (error) {
    logger.warn('Authentication failed', { error: error.message });
    res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (req.user.role !== role && req.user.role !== 'admin') {
      logger.warn('Authorization failed', {
        userId: req.user.id,
        requiredRole: role,
        userRole: req.user.role,
      });
      
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
}

/**
 * Generate JWT token
 */
export function generateToken(user: { id: string; email: string; role?: string }): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role || 'user',
    },
    JWT_SECRET,
    {
      expiresIn: '7d',
    }
  );
}