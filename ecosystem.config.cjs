const fs = require('fs');
const path = require('path');

// Kontrola cest k serveru (dist/server.js, přímý server.js, nebo fallback na tsx)
const distServerPath = path.resolve(__dirname, 'dist', 'server.js');
const rootServerPath = path.resolve(__dirname, 'server.js');

let scriptTarget = './node_modules/.bin/tsx';
let scriptArgs = 'server.ts';

if (fs.existsSync(distServerPath)) {
  scriptTarget = 'dist/server.js';
  scriptArgs = '';
} else if (fs.existsSync(rootServerPath)) {
  scriptTarget = 'server.js';
  scriptArgs = '';
}

module.exports = {
  apps: [
    {
      name: 'eusstat',
      script: scriptTarget,
      args: scriptArgs,
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
