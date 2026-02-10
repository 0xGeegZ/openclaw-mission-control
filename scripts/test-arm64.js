#!/usr/bin/env node

/**
 * ARM64 Test Runner Workaround
 *
 * On ARM64 systems, turbo can have issues with binary compatibility.
 * This script detects the current architecture and:
 * - Uses turbo on x64 systems (optimal: caching + parallelization)
 * - Runs tests per-workspace on ARM64 systems (reliable: no binary issues)
 *
 * Usage:
 *   npm test            # Runs @packages/shared tests
 *   npm run test:all    # Runs all workspace tests
 */

const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const isARM64 = os.arch() === 'arm64';
const testAll = process.argv[2] === 'all';
const isCI = process.env.CI === 'true';

console.log(`[TEST-ARM64] Detected architecture: ${os.arch()}`);
console.log(`[TEST-ARM64] Running in CI mode: ${isCI}`);
console.log(`[TEST-ARM64] Test scope: ${testAll ? 'all workspaces' : '@packages/shared'}`);
console.log();

/**
 * Run tests using turbo (x64 systems, optimal path)
 */
function runViaTurbo() {
  console.log('[TEST-ARM64] Using turbo (x64 optimized)...\n');
  try {
    const cmd = testAll
      ? 'turbo run test'
      : 'turbo run test --filter=@packages/shared';
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    process.exit(e.status || 1);
  }
}

/**
 * Run tests per-workspace (ARM64 workaround)
 */
function runPerWorkspace() {
  console.log('[TEST-ARM64] Using per-workspace runner (ARM64 workaround)...\n');

  const workspaces = testAll
    ? ['packages/shared', 'packages/backend', 'packages/ui', 'apps/web', 'apps/runtime']
    : ['packages/shared'];

  let hasErrors = false;

  for (const workspace of workspaces) {
    const workspaceDir = path.join(__dirname, '..', workspace);
    
    // Check if workspace has a test script
    try {
      const packageJsonPath = path.join(workspaceDir, 'package.json');
      const packageJson = require(packageJsonPath);
      
      if (!packageJson.scripts?.test) {
        console.log(`[TEST-ARM64] Skipping ${workspace} (no test script)\n`);
        continue;
      }

      console.log(`[TEST-ARM64] Testing ${workspace}...\n`);
      
      try {
        execSync(`cd ${workspaceDir} && npm run test`, { stdio: 'inherit' });
      } catch (e) {
        console.error(`\n[TEST-ARM64] FAILED: ${workspace}\n`);
        hasErrors = true;
        // Continue with other workspaces instead of stopping
      }
    } catch (e) {
      console.log(`[TEST-ARM64] Skipping ${workspace} (not found or no package.json)\n`);
    }
  }

  if (hasErrors) {
    console.error('\n[TEST-ARM64] Some tests failed');
    process.exit(1);
  }

  console.log('[TEST-ARM64] All tests passed');
}

// Choose path based on architecture
if (isARM64) {
  runPerWorkspace();
} else {
  runViaTurbo();
}
