import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { ENV, TOOLLOCK_CONFIG } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { ToolLockConfig } from '../config/toollock-config.js';
import { LockEngineService } from '../lock/lock-engine.service.js';
import { serializeLockfile } from '../lock/lockfile.js';
import { UpstreamService } from '../upstream/upstream.service.js';

/** `toollock init`: approves every tool the upstream servers expose right now and writes mcp.lock.json. */
export async function runInitLock(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const config = app.get<ToolLockConfig>(TOOLLOCK_CONFIG);
    const env = app.get<Env>(ENV);
    const upstream = app.get(UpstreamService);

    // Refuse a partial lock: a server that's down now would have all its tools pending later.
    const missing = config.servers.map((s) => s.id).filter((id) => !upstream.serverIds().includes(id));
    if (missing.length) throw new Error(`Cannot init: upstream server(s) not connected: ${missing.join(', ')}`);

    const tools = (await Promise.all(config.servers.map((s) => upstream.listServerTools(s.id)))).flat();
    const lockfile = await app.get(LockEngineService).initLock(tools);
    const file = path.resolve(env.LOCKFILE_PATH);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, serializeLockfile(lockfile));
    new Logger('init-lock').log(`Approved ${tools.length} tool(s) from ${config.servers.length} server(s); wrote ${file}`);
  } finally {
    await app.close();
  }
}
