module.exports = {
  apps: [{
    // Main application
    name: 'ig-pipeline',
    script: './src/cli-continuous.mjs',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '2G',
    
    // Environment
    env: {
      NODE_ENV: 'production',
      NODE_OPTIONS: '--max-old-space-size=4096'
    },
    
    // Logging
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    
    // Restart policy
    restart_delay: 5000,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Watch (disabled in production)
    watch: false,
    
    // Graceful reload
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Additional options
    vizion: false,
    post_update: ['npm install'],
    
    // Monitoring
    instance_var: 'INSTANCE_ID',
    
    // Error handling
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    pid_file: './pids/ig-pipeline.pid',
    
    // Cron restart (optional - restart daily at 3 AM)
    // cron_restart: '0 3 * * *',
  }],

  // Deploy configuration (optional)
  deploy: {
    production: {
      user: 'ubuntu',
      host: 'YOUR_SERVER_IP',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/your-repo.git',
      path: '/home/ubuntu/ig-automation',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};