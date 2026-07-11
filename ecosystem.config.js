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
    },
  ],
};
