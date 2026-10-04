const fs = require('fs');
const path = require('path');

// Kontrola cest k serveru (dist/server.js, přímý server.js, nebo fallback na tsx)
const distServerPath = path.resolve(__dirname, 'dist', 'server.js');
const rootServerPath = path.resolve(__dirname, 'server.js');

let scriptTarget = 'dist/server.js';
let scriptArgs = undefined;

if (fs.existsSync(distServerPath)) {
  scriptTarget = 'dist/server.js';
} else if (fs.existsSync(rootServerPath)) {
  scriptTarget = 'server.js';
} else {
  scriptTarget = './node_modules/.bin/tsx';
  scriptArgs = 'server.ts';
}

module.exports = {
  apps: [
    {
      name: 'eusstat',
      script: scriptTarget,
      ...(scriptArgs ? { args: scriptArgs } : {}),
      cwd: __dirname,
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
