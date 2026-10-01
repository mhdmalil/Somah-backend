module.exports = {
  apps: [
    {
      name: "somahland-api",
      script: "dist/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
}
