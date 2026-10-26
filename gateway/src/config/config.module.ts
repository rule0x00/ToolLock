import { Global, Module } from '@nestjs/common';
import { loadEnv, type Env } from './env.js';
import { loadToolLockConfig } from './toollock-config.js';

export const ENV = Symbol('ENV');
export const TOOLLOCK_CONFIG = Symbol('TOOLLOCK_CONFIG');

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: TOOLLOCK_CONFIG, inject: [ENV], useFactory: (env: Env) => loadToolLockConfig(env.TOOLLOCK_CONFIG) },
  ],
  exports: [ENV, TOOLLOCK_CONFIG],
})
export class ConfigModule {}
