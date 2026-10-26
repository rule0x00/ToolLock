import { runInitLock } from './cli/init-lock.command.js';
import { runMigrate } from './cli/migrate.command.js';
import { bootstrapGateway } from './bootstrap.js';

// Usage: main.js [init | migrate]   (no argument starts the HTTP gateway)
const command = process.argv[2];

try {
  if (command === 'init') await runInitLock();
  else if (command === 'migrate') await runMigrate();
  else if (command === undefined) await bootstrapGateway();
  else {
    console.error('Usage: main.js [init | migrate]');
    process.exitCode = 2;
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
}
