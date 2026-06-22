#!/usr/bin/env node

import { runCli } from '../src/cli.js';

runCli().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
