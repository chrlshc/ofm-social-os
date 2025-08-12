import type { Request, Response, NextFunction } from "express";
import { buildOIDC } from "../lib/oidc";
import { env } from "../lib/env";
import crypto from "crypto";
import { query } from "../lib/db";

let _oidc: any;
async function oidc() { 
  return _oidc ||= await buildOIDC(); 
}

export async function login(req: Request, res: Response) {
  try {
    const { client, generators } = await oidc();
    const state = crypto.randomBytes(16).toString("hex");
    const nonce = generators.nonce();
    (req.session as any).oidc = { state, nonce };
    
    const authUrl = client.authorizationUrl({
      scope: "openid email profile",
      state, 
      nonce,
    });
    
    res.redirect(authUrl);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
}

export async function callback(req: Request, res: Response) {
  try {
    const { client } = await oidc();
    const params = client.callbackParams(req);
    const s = (req.session as any).oidc || {};
    
    const tokenSet = await client.callback(env.OIDC_REDIRECT_URI, params, { 
      state: s.state, 
      nonce: s.nonce 
    });
    
    const claims = tokenSet.claims();
    const email = claims.email as string;
    const orgDomain = email ? email.split("@")[1] : "";
    
    // Check organization allowlist if configured
    const allowedOrgs = (req as any).allowedOrgs;
    if (allowedOrgs && allowedOrgs.length > 0) {
      if (!allowedOrgs.includes(orgDomain)) {
        return res.status(403).json({ error: "Organization not allowed" });
      }
    }
    
    // Get roles from database or use OIDC claims
    let roles = (claims["roles"] as string[] | undefined) || [];
    
    try {
      const roleResult = await query<{roles: string[]}>(
        "SELECT roles FROM rbac_roles WHERE email = $1",
        [email]
      );
      if (roleResult.rows.length > 0) {
        roles = roleResult.rows[0].roles || [];
      }
    } catch (error) {
      console.warn("Could not fetch roles from database:", error);
    }
    
    (req.session as any).user = {
      sub: claims.sub,
      email,
      name: claims.name,
      orgDomain,
      roles,
    };
    
    res.redirect("/internal/status");
  } catch (error) {
    console.error("Callback error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any)?.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

export async function logout(req: Request, res: Response) {
  (req.session as any).destroy((err: any) => {
    if (err) {
      console.error("Logout error:", err);
    }
    res.redirect("/login");
  });
}