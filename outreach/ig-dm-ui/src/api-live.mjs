#!/usr/bin/env node
import http from 'node:http';
import { DMTrackingDatabase } from './database/dm-tracking-db.mjs';

const PORT = Number(process.env.LIVE_API_PORT || 8088);

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function notFound(res) { 
  json(res, 404, { ok: false, error: 'not_found' }); 
}

async function liveHandler(req, res) {
  if (req.url === '/health') {
    return json(res, 200, { ok: true });
  }
  
  if (req.url?.startsWith('/stats/live')) {
    const db = new DMTrackingDatabase();
    
    try {
      await db.initialize();
      
      // Global reply rate
      const globalRR = await db.getRecentReplyRate(30);
      
      // Per-account stats
      const accStats = await db.getAccountReplyStats();
      
      // Account performance
      const perfResult = await db.client.query(`
        SELECT account, hourly_sent, daily_sent, proxy_switches, errors 
        FROM account_performance
      `);
      
      const accounts = [];
      for (const row of perfResult.rows) {
        const stats = accStats.get(row.account) || {};
        accounts.push({
          account: row.account,
          hourly_sent: Number(row.hourly_sent || 0),
          daily_sent: Number(row.daily_sent || 0),
          proxy_switches: Number(row.proxy_switches || 0),
          errors: Number(row.errors || 0),
          reply_rate_30m: Number(stats.reply_rate_30m || 0),
          sent_30m: Number(stats.sent_30m || 0),
          replied_30m: Number(stats.replied_30m || 0),
          tempo_status: stats.reply_rate_30m > 0.10 ? 'slow' : 'normal',
          updated_at: stats.updated_at || null
        });
      }
      
      // Recent activity
      const recentResult = await db.client.query(`
        SELECT COUNT(*) as total_sent_1h
        FROM dm_outreach_logs
        WHERE sent_at > NOW() - INTERVAL '1 hour'
      `);
      
      await db.close();
      
      return json(res, 200, {
        ok: true,
        timestamp: new Date().toISOString(),
        global: { 
          reply_rate_30m: Number(globalRR),
          total_sent_1h: Number(recentResult.rows[0]?.total_sent_1h || 0)
        },
        accounts: accounts.sort((a, b) => b.sent_30m - a.sent_30m),
        system: {
          backpressure_active: accounts.some(a => a.tempo_status === 'slow'),
          accounts_throttled: accounts.filter(a => a.tempo_status === 'slow').length
        }
      });
      
    } catch (e) {
      await db.close();
      return json(res, 500, { ok: false, error: e.message });
    }
  }
  
  return notFound(res);
}

const server = http.createServer((req, res) => {
  liveHandler(req, res).catch(err => {
    console.error('Server error:', err);
    json(res, 500, { ok: false, error: 'internal_error' });
  });
});

server.listen(PORT, () => {
  console.log(`📡 Live API listening on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Stats:  http://localhost:${PORT}/stats/live`);
});