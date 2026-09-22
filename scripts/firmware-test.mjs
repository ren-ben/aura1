import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const fw = resolve(import.meta.dirname, '../packages/firmware');
const run = (args) => {
  const r = spawnSync('docker', args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run(['build', '-q', '-t', 'aura-fw-test', '-f', resolve(fw, 'test.Dockerfile'), fw]);
run([
  'run', '--rm',
  '-v', `${fw}:/fw`,
  // The art pack, for test_looks to draw Kael'thos into its pages.
  '-v', `${resolve(fw, '../art/out/sd/art')}:/art:ro`,
  '-v', 'aura-pio:/root/.platformio',
  'aura-fw-test',
  'sh', '-c', `mkdir -p .pio/looks && pio test -e native ${process.argv.slice(2).join(' ')}`,
]);
