import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module.js';
import { AuditModule } from './audit/audit.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './db/database.module.js';
import { ProxyModule } from './proxy/proxy.module.js';

@Module({
  imports: [ConfigModule, DatabaseModule, AuditModule, ProxyModule, AdminModule],
})
export class AppModule {}
