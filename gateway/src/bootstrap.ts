import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';

/** Starts the gateway: one HTTP app serving /mcp (Streamable HTTP) and /api/* (admin). */
export async function bootstrapGateway(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);
  if (!env.MCP_CLIENT_TOKEN) {
    await app.close();
    throw new Error('MCP_CLIENT_TOKEN must be set to serve /mcp');
  }
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Gateway').log(`Listening on :${env.PORT} (MCP at /mcp, admin API at /api)`);
  return app;
}
