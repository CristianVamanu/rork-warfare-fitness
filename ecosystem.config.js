// pm2 process definition — cluster mode with 2 instances so `pm2 reload`
// restarts them one at a time instead of all at once, keeping the site up
// through every deploy instead of a ~1s gap while the single process swaps.
module.exports = {
  apps: [
    {
      name: 'warfare-fitness',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      exec_mode: 'cluster',
      instances: 2,
      env: {
        NODE_ENV: 'production',
      },
      // deploy.sh runs `pm2 reload ecosystem.config.js --env production`,
      // which looks for this exact key — without it pm2 warns "Environment
      // [production] is not defined in process file" on every reload.
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
