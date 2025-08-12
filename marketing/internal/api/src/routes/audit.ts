import { Router } from "express";
import { query } from "../lib/db";
import { audit } from "../lib/audit";

export const auditRouter = Router();

auditRouter.get("/", async (req, res) => {
  try {
    const { limit = "50", action, resource } = req.query;
    
    let sql = "SELECT created_at, actor_email, action, resource, meta, ip FROM audit_logs";
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (action) {
      conditions.push(`action ILIKE $${params.length + 1}`);
      params.push(`%${action}%`);
    }
    
    if (resource) {
      conditions.push(`resource ILIKE $${params.length + 1}`);
      params.push(`%${resource}%`);
    }
    
    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    
    sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1);
    params.push(Number(limit));
    
    const result = await query(sql, params);
    
    await audit(req, "audit_view", "audit_logs", { 
      limit: Number(limit), 
      filters: { action, resource } 
    });
    
    res.json({ 
      items: result.rows.map(row => ({
        ...row,
        created_at: row.created_at?.toISOString()
      })),
      total: result.rows.length,
      limit: Number(limit)
    });
  } catch (error) {
    console.error("Audit query error:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

auditRouter.get("/stats", async (req, res) => {
  try {
    const [actionsResult, usersResult, recentResult] = await Promise.all([
      // Top actions
      query(`
        SELECT action, COUNT(*) as count 
        FROM audit_logs 
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY action 
        ORDER BY count DESC 
        LIMIT 10
      `),
      
      // Active users
      query(`
        SELECT actor_email, COUNT(*) as count 
        FROM audit_logs 
        WHERE created_at > NOW() - INTERVAL '24 hours' 
        AND actor_email IS NOT NULL
        GROUP BY actor_email 
        ORDER BY count DESC 
        LIMIT 10
      `),
      
      // Recent activity by hour
      query(`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as count
        FROM audit_logs 
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `)
    ]);
    
    await audit(req, "audit_stats_view", "audit_logs", {});
    
    res.json({
      topActions: actionsResult.rows,
      activeUsers: usersResult.rows,
      recentActivity: recentResult.rows.map(row => ({
        ...row,
        hour: row.hour?.toISOString()
      }))
    });
  } catch (error) {
    console.error("Audit stats error:", error);
    res.status(500).json({ error: "Failed to fetch audit stats" });
  }
});