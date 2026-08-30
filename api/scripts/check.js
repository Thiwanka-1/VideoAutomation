import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function javascriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') return javascriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  }));
  return nested.flat();
}

const files = await javascriptFiles(path.join(projectRoot, 'src'));
for (const file of files) {
  if (file.endsWith(`${path.sep}cli.js`)) continue;
  await import(pathToFileURL(file));
}
console.log(`Imported ${files.length - 1} source modules successfully.`);
