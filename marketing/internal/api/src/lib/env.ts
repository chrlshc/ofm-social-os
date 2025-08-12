import { z } from "zod";

export const env = z.object({
  PORT: z.string().default("4010"),
  SESSION_SECRET: z.string().min(32),
  OIDC_ISSUER_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string(),
  OIDC_CLIENT_SECRET: z.string(),
  OIDC_REDIRECT_URI: z.string().url(),
  ALLOWLIST_IPS: z.string().optional(),       // "1.2.3.4,5.6.7.8/32"
  ALLOWLIST_ORGS: z.string().optional(),      // "mycorp.com,partner.io"
  DATABASE_URL: z.string().url(),
}).parse(process.env);