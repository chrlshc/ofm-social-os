import { Router } from "express";
import { audit } from "../lib/audit";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
export const opsRouter = Router();

// Integration with existing canary scripts
const CANARY_SCRIPT_PATH = "../../../scripts/canary";
const OPS_CLI_PATH = "../../../ops/cli/ofm-ops-cli.ts";

opsRouter.get("/", (req, res) => {
  const user = (req.session as any)?.user;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>OFM Internal Operations</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { 
          font-family: ui-sans-serif, -apple-system, system-ui, sans-serif; 
          margin: 2rem; 
          background: #f8fafc;
        }
        .container { 
          max-width: 1000px; 
          background: white; 
          padding: 2rem; 
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
        .section { 
          background: #f9fafb; 
          padding: 1.5rem; 
          border-radius: 8px; 
          border: 1px solid #e5e7eb;
        }
        .section h3 { margin: 0 0 1rem 0; color: #1f2937; }
        .btn { 
          display: inline-block; 
          padding: 0.75rem 1rem; 
          margin: 0.5rem 0.5rem 0.5rem 0; 
          border: none; 
          border-radius: 6px; 
          cursor: pointer; 
          text-decoration: none;
          font-size: 0.875rem;
          font-weight: 500;
        }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-success { background: #059669; color: white; }
        .btn-warning { background: #d97706; color: white; }
        .btn-danger { background: #dc2626; color: white; }
        .btn:hover { opacity: 0.9; }
        .status { padding: 1rem; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 6px; margin: 1rem 0; }
        .warning { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
        .back-link { margin-bottom: 2rem; }
        .back-link a { color: #3b82f6; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="back-link">
          <a href="/internal/status">← Back to Status</a>
        </div>
        
        <h2>🚀 Operations Control Panel</h2>
        
        <div class="status">
          <strong>Operator:</strong> ${user?.name || user?.email}
          <br><strong>Permissions:</strong> ${user?.roles?.join(", ") || "None"}
        </div>
        
        <div class="grid">
          <div class="section">
            <h3>🎯 Canary Deployment</h3>
            <p>Control canary deployment rollouts with integrated SLO monitoring.</p>
            
            <button class="btn btn-success" onclick="executeOp('canary-promote')">
              Promote Canary
            </button>
            <button class="btn btn-warning" onclick="executeOp('canary-pause')">
              Pause Canary
            </button>
            <button class="btn btn-primary" onclick="executeOp('canary-resume')">
              Resume Canary
            </button>
            <button class="btn btn-danger" onclick="executeOp('canary-rollback')">
              Rollback Canary
            </button>
          </div>
          
          <div class="section">
            <h3>📊 System Operations</h3>
            <p>Core system management and health operations.</p>
            
            <button class="btn btn-primary" onclick="executeOp('health-check')">
              Health Check
            </button>
            <button class="btn btn-primary" onclick="executeOp('slo-status')">
              SLO Status
            </button>
            <button class="btn btn-warning" onclick="executeOp('db-backup')">
              Database Backup
            </button>
            <button class="btn btn-warning" onclick="executeOp('security-scan')">
              Security Scan
            </button>
          </div>
          
          <div class="section">
            <h3>📋 Monitoring</h3>
            <p>View logs and monitoring information.</p>
            
            <a href="/internal/audit" class="btn btn-primary">Audit Logs</a>
            <button class="btn btn-primary" onclick="viewLogs()">
              Application Logs
            </button>
            <button class="btn btn-primary" onclick="openGrafana()">
              Open Grafana
            </button>
          </div>
        </div>
        
        <div id="result" style="margin-top: 2rem; display: none;">
          <h3>Operation Result</h3>
          <div id="result-content" style="background: #f3f4f6; padding: 1rem; border-radius: 6px; white-space: pre-wrap; font-family: monospace;"></div>
        </div>
      </div>
      
      <script>
        async function executeOp(operation) {
          const resultDiv = document.getElementById('result');
          const contentDiv = document.getElementById('result-content');
          
          resultDiv.style.display = 'block';
          contentDiv.textContent = 'Executing operation...';
          
          try {
            const response = await fetch('/internal/ops/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ operation, timestamp: new Date().toISOString() })
            });
            
            const result = await response.json();
            
            if (response.ok) {
              contentDiv.textContent = result.output || 'Operation completed successfully';
              contentDiv.style.background = '#ecfdf5';
            } else {
              contentDiv.textContent = result.error || 'Operation failed';
              contentDiv.style.background = '#fef2f2';
            }
          } catch (error) {
            contentDiv.textContent = 'Error: ' + error.message;
            contentDiv.style.background = '#fef2f2';
          }
        }
        
        function viewLogs() {
          window.open('/internal/ops/logs', '_blank');
        }
        
        function openGrafana() {
          window.open('https://grafana.ofm.social', '_blank');
        }
      </script>
    </body>
    </html>
  `);
});

opsRouter.post("/canary/promote", async (req, res) => {
  try {
    await audit(req, "canary_promote", "rollout", { 
      step: req.body?.step || "auto",
      timestamp: new Date().toISOString() 
    });
    
    // Integration with existing canary deployment script
    const { stdout, stderr } = await execAsync(`npx ts-node ${OPS_CLI_PATH} canary promote`, {
      cwd: process.cwd(),
      timeout: 30000
    });
    
    res.json({ 
      ok: true, 
      message: "Canary promotion initiated",
      output: stdout,
      error: stderr 
    });
  } catch (error) {
    console.error("Canary promote error:", error);
    res.status(500).json({ 
      error: "Canary promotion failed", 
      details: error.message 
    });
  }
});

opsRouter.post("/canary/rollback", async (req, res) => {
  try {
    await audit(req, "canary_rollback", "rollout", { 
      reason: req.body?.reason || "manual_rollback",
      timestamp: new Date().toISOString() 
    });
    
    // Integration with existing canary rollback script
    const { stdout, stderr } = await execAsync(`npx ts-node ${OPS_CLI_PATH} canary abort`, {
      cwd: process.cwd(),
      timeout: 30000
    });
    
    res.json({ 
      ok: true, 
      message: "Canary rollback initiated",
      output: stdout,
      error: stderr 
    });
  } catch (error) {
    console.error("Canary rollback error:", error);
    res.status(500).json({ 
      error: "Canary rollback failed", 
      details: error.message 
    });
  }
});

opsRouter.post("/execute", async (req, res) => {
  try {
    const { operation } = req.body;
    
    await audit(req, "ops_execute", operation, { 
      timestamp: new Date().toISOString() 
    });
    
    let command: string;
    let timeout = 30000;
    
    switch (operation) {
      case "canary-promote":
        command = `npx ts-node ${OPS_CLI_PATH} canary promote`;
        break;
      case "canary-pause":
        command = `npx ts-node ${OPS_CLI_PATH} canary pause`;
        break;
      case "canary-resume":
        command = `npx ts-node ${OPS_CLI_PATH} canary resume`;
        break;
      case "canary-rollback":
        command = `npx ts-node ${OPS_CLI_PATH} canary abort`;
        break;
      case "health-check":
        command = `npx ts-node ${OPS_CLI_PATH} health`;
        break;
      case "slo-status":
        command = `npx ts-node ${OPS_CLI_PATH} slo`;
        break;
      case "db-backup":
        command = `npx ts-node ${OPS_CLI_PATH} db backup`;
        timeout = 300000; // 5 minutes for backup
        break;
      case "security-scan":
        command = `npx ts-node ${OPS_CLI_PATH} security scan`;
        timeout = 120000; // 2 minutes for security scan
        break;
      default:
        return res.status(400).json({ error: "Unknown operation" });
    }
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout
    });
    
    res.json({ 
      ok: true, 
      operation,
      output: stdout || "Operation completed",
      error: stderr || null 
    });
  } catch (error) {
    console.error(`Operation ${req.body.operation} error:`, error);
    res.status(500).json({ 
      error: `Operation failed: ${req.body.operation}`, 
      details: error.message 
    });
  }
});

opsRouter.get("/logs", async (req, res) => {
  try {
    const { lines = "100" } = req.query;
    
    await audit(req, "logs_view", "application_logs", { 
      lines: Number(lines),
      timestamp: new Date().toISOString() 
    });
    
    const { stdout } = await execAsync(`npx ts-node ${OPS_CLI_PATH} logs -n ${lines}`, {
      cwd: process.cwd(),
      timeout: 10000
    });
    
    res.type('text/plain');
    res.send(stdout || "No logs available");
  } catch (error) {
    console.error("Logs error:", error);
    res.status(500).type('text/plain').send(`Error fetching logs: ${error.message}`);
  }
});