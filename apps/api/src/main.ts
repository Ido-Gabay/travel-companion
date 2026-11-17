import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';

// Local development reads apps/api/.env. In production, the host sets real
// environment variables and no file is needed. Existing variables win.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  Logger.log(`API listening on http://${config.host}:${config.port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  // Config errors are already readable; print them without a stack trace.
  const isConfigError =
    error instanceof Error && error.message.startsWith('Invalid environment configuration');
  console.error(isConfigError ? error.message : error);
  process.exit(1);
});
