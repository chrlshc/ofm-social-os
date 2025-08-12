import { Router } from "express";
import os from "os";
import { query } from "../lib/db";

export const statusRouter = Router();

statusRouter.get("/", async (req, res) => {
  const user = (req.session as any)?.user;
  const uptime = process.uptime();
  const loadAvg = os.loadavg();
  const memUsage = process.memoryUsage();
  
  // Get recent activity count
  let recentActivity = 0;
  try {
    const result = await query<{count: string}>(
      "SELECT COUNT(*) as count FROM audit_logs WHERE created_at > NOW() - INTERVAL '1 hour'"
    );
    recentActivity = parseInt(result.rows[0]?.count || "0");
  } catch (error) {
    console.warn("Could not fetch activity count:", error);
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>OFM Internal Status</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: ui-sans-serif, -apple-system, system-ui, sans-serif; 
          margin: 2rem; 
          background: #f8fafc;
        }
        .container { 
          max-width: 800px; 
          background: white; 
          padding: 2rem; 
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        h2 { color: #1f2937; margin-top: 0; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
        .card { 
          background: #f9fafb; 
          padding: 1rem; 
          border-radius: 6px; 
          border: 1px solid #e5e7eb;
        }
        .card h3 { margin: 0 0 0.5rem 0; font-size: 0.875rem; color: #6b7280; text-transform: uppercase; }
        .card .value { font-size: 1.5rem; font-weight: 600; color: #1f2937; }
        .user-info { 
          background: #eff6ff; 
          border: 1px solid #dbeafe; 
          padding: 1rem; 
          border-radius: 6px; 
          margin-bottom: 2rem;
        }
        .role { 
          background: #059669; 
          color: white; 
          padding: 0.25rem 0.5rem; 
          border-radius: 4px; 
          font-size: 0.75rem; 
          margin-left: 0.5rem;
        }
        .links { margin-top: 2rem; }
        .links a { 
          display: inline-block; 
          margin-right: 1rem; 
          padding: 0.5rem 1rem; 
          background: #3b82f6; 
          color: white; 
          text-decoration: none; 
          border-radius: 4px; 
          font-size: 0.875rem;
        }
        .links a:hover { background: #2563eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🎛️ OFM Internal Operations Status</h2>
        
        <div class="user-info">
          <strong>Logged in as:</strong> ${user?.name || user?.email || 'Unknown'}
          ${user?.roles?.map((role: string) => `<span class="role">${role}</span>`).join('') || ''}
          <br>
          <small>Organization: ${user?.orgDomain || 'Unknown'}</small>
        </div>
        
        <div class="grid">
          <div class="card">
            <h3>System Uptime</h3>
            <div class="value">${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m</div>
          </div>
          
          <div class="card">
            <h3>Load Average</h3>
            <div class="value">${loadAvg.map(n => n.toFixed(2)).join(", ")}</div>
          </div>
          
          <div class="card">
            <h3>Memory RSS</h3>
            <div class="value">${(memUsage.rss / 1e6).toFixed(1)} MB</div>
          </div>
          
          <div class="card">
            <h3>Recent Activity</h3>
            <div class="value">${recentActivity}</div>
            <small>operations in last hour</small>
          </div>
        </div>
        
        <div class="links">
          <a href="/internal/audit">📋 Audit Logs</a>
          <a href="/internal/ops">🚀 Operations</a>
          <a href="/logout">🚪 Logout</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

statusRouter.get("/healthz", (_req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development'
  });
});