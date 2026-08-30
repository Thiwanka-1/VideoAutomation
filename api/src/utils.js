import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function slugify(value, maxLength = 60) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, maxLength) || 'skit';
}

export async function createJobDirectory(outputDir, topic = 'skit') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(outputDir, `${timestamp}-${slugify(topic)}`);
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function writeJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, filePath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export function withHashtags(text, hashtags) {
  const tags = hashtags.join(' ');
  return text.includes(tags) ? text : `${text.trim()}\n\n${tags}`;
}

export function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
