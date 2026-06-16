module.exports = {
  apps: [
    {
      name: 'BFID-API',
      script: 'app.js',
      instances: 1,
      autorestart: true,
      watch: false, // En producción es mejor false para evitar reinicios infinitos por logs
      max_memory_restart: '1G', // Súbelo al menos a 1GB para estar seguro
      node_args: "--max-old-space-size=1024", // Fuerza a Node a usar esa memoria
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};