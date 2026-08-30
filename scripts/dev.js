import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this development launcher through npm run dev.');
const children = [
  spawn(process.execPath, [npmCli, '--prefix', 'api', 'run', 'dev'], { cwd: projectRoot, stdio: 'inherit' }),
  spawn(process.execPath, [npmCli, '--prefix', 'client', 'run', 'dev'], { cwd: projectRoot, stdio: 'inherit' }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => {
    if (!child.killed) child.kill('SIGTERM');
  });
  process.exitCode = exitCode;
}

children.forEach((child) => {
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      console.error(`A development process exited (${signal || code}).`);
      stop(code || 1);
    }
  });
});

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
