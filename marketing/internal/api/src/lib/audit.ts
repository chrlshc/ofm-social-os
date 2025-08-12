import type { Request } from "express";
import { Pool } from "pg";
import { env } from "./env";

const pool = new Pool({ connectionString: env.DATABASE_URL });

export async function audit(req: Request, action: string, resource: string, meta: any = {}) {
  const u = (req.session as any)?.user || {};
  await pool.query(
    `INSERT INTO audit_logs(actor_sub, actor_email, action, resource, meta, ip, ua)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [u.sub||null, u.email||null, action, resource, meta, req.ip, req.get("user-agent")]
  );
}