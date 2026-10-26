import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type pg from 'pg';
import { ConfigModule } from '../config/config.module.js';
import { DatabaseModule, PG_POOL } from '../db/database.module.js';
import { migrate } from '../db/migrate.js';

// Only what migrations need: no upstream connections, no HTTP.
@Module({ imports: [ConfigModule, DatabaseModule] })
class MigrateModule {}

export async function runMigrate(): Promise<void> {
  const app = await NestFactory.createApplicationContext(MigrateModule);
  try {
    const applied = await migrate(app.get<pg.Pool>(PG_POOL));
    new Logger('migrate').log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
  } finally {
    await app.close();
  }
}
