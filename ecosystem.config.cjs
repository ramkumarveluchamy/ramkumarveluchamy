module.exports = {
  apps: [
    {
      name: 'financeme',
      script: 'server.js',
      cwd: '/opt/financeme/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Restart on crash, with exponential backoff
      restart_delay: 3000,
      max_restarts: 10,
      // Log configuration
      out_file: '/opt/financeme/logs/out.log',
      error_file: '/opt/financeme/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
