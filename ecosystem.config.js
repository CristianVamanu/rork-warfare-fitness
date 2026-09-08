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
        // Pinned explicitly. next.config.js reads NEXT_DIST_DIR for distDir,
        // and deploy.sh sets it to .next-staging for the build. pm2 stores
        // the environment a process was started with, so one start that
        // inherited that value pins the app to a directory which only exists
        // mid-deploy — the swap renames it away, and the next restart dies
        // with "Could not find a production build in .next-staging". Naming
        // the real value here means the stored env can never be wrong.
        NEXT_DIST_DIR: '.next',
      },
      // deploy.sh runs `pm2 reload ecosystem.config.js --env production`,
      // which looks for this exact key — without it pm2 warns "Environment
      // [production] is not defined in process file" on every reload.
      env_production: {
        NODE_ENV: 'production',
        NEXT_DIST_DIR: '.next',
      },
    },
  ],
};
