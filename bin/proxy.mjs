#!/usr/bin/env node

/**
 * context-proxy CLI runner
 */

import { startProxyServer } from '../src/proxy.mjs';

const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return defaultValue;
}

const port = parseInt(getArg('--port', process.env.PORT || '8080'), 10);
const target = getArg('--target', process.env.TARGET_URL || process.env.UPSTREAM_URL || '');
const outDir = getArg('--out-dir', process.env.OUT_DIR || './.context-audit');
const mock = args.includes('--mock') || !target;
const allTurns = args.includes('--all-turns');

startProxyServer({
  port,
  target,
  outDir,
  mock,
  allTurns,
});
