module.exports = {
  apps: [
    {
      name: "eeljet",
      script: "node_modules/next/dist/bin/next",
      instances: "1",
      args: "start",
      cwd: "/var/www/eeljet",
      exec_mode: "cluster",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3002,
      },
    },
  ],
};
