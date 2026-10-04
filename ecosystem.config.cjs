const fs = require('fs');
const path = require('path');

// Pokud existuje sestavený dist/server.js, použijeme nativní node.
// Jinak se jako fallback použije lokální tsx z node_modules.
const distServerPath = path.resolve(__dirname, 'dist', 'server.js');
const useCompiled = fs.existsSync(distServerPath);

module.exports = {
  apps: [
    {
      name: 'eusstat',
      script: useCompiled ? 'dist/server.js' : './node_modules/.bin/tsx',
      args: useCompiled ? [] : 'server.ts',
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
