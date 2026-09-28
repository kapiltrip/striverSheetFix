import { build } from '../node_modules/esbuild/lib/main.js';
import { spawnSync } from 'node:child_process';
await build({entryPoints:['tests/revision.test.ts'],outfile:'.verification/revision.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'warning'});
await build({entryPoints:['tests/github.test.ts'],outfile:'.verification/github.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',alias:{'cloudflare:workers':'./tests/worker-mock.ts'},logLevel:'warning'});
await build({entryPoints:['tests/local-access.test.ts'],outfile:'.verification/local-access.test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',alias:{'cloudflare:workers':'./tests/worker-mock.ts'},logLevel:'warning'});
const result=spawnSync(process.execPath,['--test','.verification/revision.test.mjs','.verification/github.test.mjs','.verification/local-access.test.mjs'],{stdio:'inherit'});process.exit(result.status??1);
