import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProxyRotator {
  constructor(configPath = path.join(__dirname, '../config/proxies.json')) {
    this.configPath = configPath;
    this.proxies = [];
    this.proxyHealth = new Map();
    this.activeProxies = new Map();
    this.loadProxies();
  }

  loadProxies() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        this.proxies = data.proxies || [];
        
        // Initialize proxy health
        this.proxies.forEach(proxy => {
          const key = this.getProxyKey(proxy);
          if (!this.proxyHealth.has(key)) {
            this.proxyHealth.set(key, {
              successRate: 100,
              lastChecked: null,
              failureCount: 0,
              responseTime: 0,
              status: 'ready'
            });
          }
        });
      }
    } catch (e) {
      console.error('Failed to load proxies:', e);
    }
  }

  getProxyKey(proxy) {
    return `${proxy.host}:${proxy.port}`;
  }

  async checkProxy(proxy) {
    const start = Date.now();
    const key = this.getProxyKey(proxy);
    
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 5000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        const responseTime = Date.now() - start;
        
        const health = this.proxyHealth.get(key);
        health.responseTime = responseTime;
        health.lastChecked = new Date().toISOString();
        health.status = 'ready';
        
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false);
      });

      socket.connect(proxy.port, proxy.host);
    });
  }

  async getWorkingProxy(options = {}) {
    const { location, type = 'all', excludeProxies = [] } = options;
    
    // Filter available proxies
    let available = this.proxies.filter(proxy => {
      const key = this.getProxyKey(proxy);
      return !excludeProxies.includes(key) && 
             !this.activeProxies.has(key) &&
             this.proxyHealth.get(key)?.status !== 'dead';
    });

    // Filter by location if specified
    if (location) {
      available = available.filter(proxy => 
        proxy.location?.toLowerCase().includes(location.toLowerCase())
      );
    }

    // Filter by type if specified
    if (type !== 'all') {
      available = available.filter(proxy => proxy.type === type);
    }

    // Sort by health metrics
    available.sort((a, b) => {
      const healthA = this.proxyHealth.get(this.getProxyKey(a));
      const healthB = this.proxyHealth.get(this.getProxyKey(b));
      
      // Prioritize success rate
      if (healthA.successRate !== healthB.successRate) {
        return healthB.successRate - healthA.successRate;
      }
      
      // Then by response time
      return healthA.responseTime - healthB.responseTime;
    });

    // Find first working proxy
    for (const proxy of available) {
      const isWorking = await this.checkProxy(proxy);
      if (isWorking) {
        return proxy;
      } else {
        this.markProxyFailed(proxy);
      }
    }

    return null;
  }

  lockProxy(proxy) {
    const key = this.getProxyKey(proxy);
    this.activeProxies.set(key, {
      lockedAt: new Date(),
      account: proxy.assignedAccount
    });
  }

  unlockProxy(proxy) {
    const key = this.getProxyKey(proxy);
    this.activeProxies.delete(key);
  }

  markProxyFailed(proxy) {
    const key = this.getProxyKey(proxy);
    const health = this.proxyHealth.get(key);
    
    health.failureCount++;
    health.successRate = Math.max(0, health.successRate - 20);
    
    // Mark as dead if too many failures
    if (health.failureCount >= 5 || health.successRate <= 20) {
      health.status = 'dead';
    }
    
    this.proxyHealth.set(key, health);
  }

  markProxySuccess(proxy) {
    const key = this.getProxyKey(proxy);
    const health = this.proxyHealth.get(key);
    
    health.failureCount = 0;
    health.successRate = Math.min(100, health.successRate + 5);
    health.status = 'ready';
    
    this.proxyHealth.set(key, health);
  }

  getProxyForAccount(account) {
    // Try to use the same proxy for an account for consistency
    if (account.lastProxy) {
      const proxy = this.proxies.find(p => 
        this.getProxyKey(p) === account.lastProxy
      );
      if (proxy && this.proxyHealth.get(account.lastProxy)?.status === 'ready') {
        return proxy;
      }
    }

    // Otherwise get a new proxy based on account location preference
    return this.getWorkingProxy({
      location: account.preferredLocation || 'US',
      type: account.proxyType || 'residential'
    });
  }

  getProxyStats() {
    const stats = {
      total: this.proxies.length,
      ready: 0,
      dead: 0,
      inUse: this.activeProxies.size,
      byLocation: {},
      byType: {},
      avgResponseTime: 0
    };

    let totalResponseTime = 0;
    let responseCount = 0;

    for (const proxy of this.proxies) {
      const health = this.proxyHealth.get(this.getProxyKey(proxy));
      
      if (health.status === 'ready') stats.ready++;
      if (health.status === 'dead') stats.dead++;
      
      const location = proxy.location || 'unknown';
      stats.byLocation[location] = (stats.byLocation[location] || 0) + 1;
      
      const type = proxy.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      if (health.responseTime > 0) {
        totalResponseTime += health.responseTime;
        responseCount++;
      }
    }

    stats.avgResponseTime = responseCount > 0 ? 
      Math.round(totalResponseTime / responseCount) : 0;

    return stats;
  }

  async healthCheck() {
    // Run periodic health check on all proxies
    console.log('🔍 Starting proxy health check...');
    
    for (const proxy of this.proxies) {
      const key = this.getProxyKey(proxy);
      if (!this.activeProxies.has(key)) {
        const isWorking = await this.checkProxy(proxy);
        if (isWorking) {
          this.markProxySuccess(proxy);
        } else {
          this.markProxyFailed(proxy);
        }
      }
    }
    
    const stats = this.getProxyStats();
    console.log(`✅ Health check complete: ${stats.ready}/${stats.total} proxies ready`);
  }
}