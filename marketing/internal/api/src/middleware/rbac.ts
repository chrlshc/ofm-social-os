import type { Request, Response, NextFunction } from "express";

export type Role = "admin" | "operator" | "viewer";

const roleHierarchy: Record<Role, Role[]> = {
  admin: ["admin", "operator", "viewer"],
  operator: ["operator", "viewer"],
  viewer: ["viewer"]
};

export function requireRole(requiredRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req.session as any)?.user;
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const userRoles = new Set(user.roles || []);
    const allowedRoles = roleHierarchy[requiredRole] || [requiredRole];
    
    const hasPermission = allowedRoles.some(role => userRoles.has(role));
    
    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Insufficient permissions", 
        required: requiredRole,
        current: user.roles 
      });
    }
    
    next();
  };
}

export function hasRole(user: any, role: Role): boolean {
  if (!user || !user.roles) return false;
  const userRoles = new Set(user.roles);
  const allowedRoles = roleHierarchy[role] || [role];
  return allowedRoles.some(r => userRoles.has(r));
}