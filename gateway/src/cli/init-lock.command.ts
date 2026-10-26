import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';

/** `toollock init`: approves every current upstream tool. Lock engine arrives in build step 5. */
export async function runInitLock(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    new Logger('init-lock').error('Not implemented yet (build step 5).');
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}
