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

server.headersTimeout = config.serverHeadersTimeoutMs;
server.requestTimeout = config.serverRequestTimeoutMs;
server.keepAliveTimeout = config.serverKeepAliveTimeoutMs;

let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info('Shutting down AirWise server', { signal });

  const forceExitTimer = setTimeout(() => {
    logger.error('Forced server exit after shutdown timeout', { signal });
    process.exit(1);
  }, config.serverShutdownTimeoutMs);
  forceExitTimer.unref();

  server.close(() => {
    clearTimeout(forceExitTimer);
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
