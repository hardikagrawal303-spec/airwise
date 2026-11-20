import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const app = createApp({ config });

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info('AirWise server started', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    aiEnabled: config.aiEnabled,
  });
});

function shutdown(signal) {
  logger.info('Shutting down AirWise server', { signal });
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
