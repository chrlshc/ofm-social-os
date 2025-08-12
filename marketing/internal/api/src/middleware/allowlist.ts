import { env } from "../lib/env";
import ipaddr from "ipaddr.js";
import type { Request, Response, NextFunction } from "express";

const ips = (env.ALLOWLIST_IPS || "").split(",").filter(Boolean);
const orgs = (env.ALLOWLIST_ORGS || "").split(",").filter(Boolean);

export function allowlist(req: Request, res: Response, next: NextFunction) {
  // IP-based allowlist
  const hop = (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || req.socket.remoteAddress;
  
  try {
    if (ips.length > 0) {
      const ip = ipaddr.parse(hop);
      const ipAllowed = ips.some(cidr => {
        const [net, len = "32"] = cidr.split("/");
        const range = ipaddr.parse(net);
        return ip.match(range, parseInt(len, 10));
      });
      
      if (!ipAllowed) {
        return res.status(403).json({ error: "IP not allowed" });
      }
    }
    
    // Organization-based allowlist (can be checked later during auth)
    if (orgs.length > 0) {
      (req as any).allowedOrgs = orgs;
    }
    
    next();
  } catch (error) {
    return res.status(403).json({ error: "IP check failed" });
  }
}