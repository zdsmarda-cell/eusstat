const fs = require('fs');
const path = require('path');

const rootServer = path.resolve(__dirname, 'server.js');
const distServer = path.resolve(__dirname, 'dist', 'server.js');

let scriptTarget = 'server.js';
if (fs.existsSync(rootServer)) {
  scriptTarget = 'server.js';
} else if (fs.existsSync(distServer)) {
  scriptTarget = 'dist/server.js';
}

module.exports = {
  apps: [
    {
      name: 'eusstat',
      script: scriptTarget,
      exec_mode: 'fork',       // DŮLEŽITÉ: fork režim (nikoliv cluster)
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        APP_PORT: 3030,
      },
    },
  ],
};
