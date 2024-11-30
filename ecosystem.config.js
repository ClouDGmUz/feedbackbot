module.exports = {
  apps: [{
    name: 'feedbackbot',
    script: 'server.js',
    watch: true,
    ignore_watch: ['node_modules', 'logs', 'public'],
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    time: true
  }]
};
