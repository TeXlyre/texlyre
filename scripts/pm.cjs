#!/usr/bin/env node

const { spawnSync } = require('child_process');

const detectPackageManager = () => {
    const userAgent = process.env.npm_config_user_agent || '';
    if (userAgent.includes('bun')) return 'bun';
    if (userAgent.includes('yarn')) return 'yarn';
    if (userAgent.includes('pnpm')) return 'pnpm';
    return 'npm';
};

const pm = detectPackageManager();
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Usage: node scripts/pm.js <command> [...args]');
    process.exit(1);
}

const isScript = args[0] === 'run';
const command = isScript ? pm : (pm === 'npm' ? 'npx' : pm);
const finalArgs = isScript ? (pm === 'npm' || pm === 'bun' ? args : args.slice(1)) : args;

const result = spawnSync(command, finalArgs, {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd()
});

if (result.error) {
    console.error(`Error:`, result.error);
    process.exit(1);
}

process.exit(result.status || 0);