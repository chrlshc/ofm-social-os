import express from "express";
import session from "express-session";
import helmet from "helmet";
import { env } from "./lib/env";
import { allowlist } from "./middleware/allowlist";
import { login, callback, requireAuth, logout } from "./middleware/auth";
import { requireRole } from "./middleware/rbac";
import { statusRouter } from "./routes/status";
import { auditRouter } from "./routes/audit";
import { opsRouter } from "./routes/ops";

const app = express();

// Trust proxy for accurate IP addresses
app.set("trust proxy", 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Basic middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({ 
  secret: env.SESSION_SECRET, 
  resave: false, 
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// IP/Organization allowlist
app.use(allowlist);

// Root redirect
app.get("/", (req, res) => {
  if ((req.session as any)?.user) {
    res.redirect("/internal/status");
  } else {
    res.redirect("/login");
  }
});

// Authentication routes
app.get("/login", login);
app.get("/oidc/callback", callback);
app.get("/logout", logout);

// Protected routes
app.use("/internal/status", requireAuth, requireRole("viewer"), statusRouter);
app.use("/internal/audit", requireAuth, requireRole("operator"), auditRouter);
app.use("/internal/ops", requireAuth, requireRole("admin"), opsRouter);

// Health check (unprotected for load balancer)
app.get("/health", (req, res) => {
  res.json({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    service: "ofm-internal-ops"
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ 
    error: "Internal server error",
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Not found", 
    path: req.path 
  });
});

const port = Number(env.PORT);
app.listen(port, () => {
  console.log(`🎛️ OFM Internal Operations API listening on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`OIDC Issuer: ${env.OIDC_ISSUER_URL}`);
});