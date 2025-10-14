module.exports = {
  apps: [{
    name: 'somah-backend',
    script: 'server.js',
    instances: 'max', // Use all CPU cores
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3001
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    // Performance tuning
    max_memory_restart: '1G',
    min_uptime: '10s',
    max_restarts: 10,
    
    // Logging
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Monitoring
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    
    // Health monitoring
    health_check_grace_period: 3000,
    health_check_interval: 30000,
    
    // Advanced settings
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Environment variables
    env_file: '.env'
  }],
  
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/somah-backend.git',
      path: '/var/www/somah-backend',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
