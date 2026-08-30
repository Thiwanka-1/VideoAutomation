import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';

function testConfig(outputDir) {
  return {
    outputDir,
    api: { allowedOrigins: ['http://localhost:5173'], host: '127.0.0.1', port: 0 },
    channel: { brand: 'Test Studio', niche: 'original tests', language: 'English' },
    video: { width: 1080, height: 1920, fps: 30, targetDurationSeconds: 60 },
    publishing: { dryRun: true, requireApproval: true, platforms: ['youtube'] },
    ollama: { baseUrl: 'http://127.0.0.1:1', model: 'test-model' },
    huggingFace: { token: 'super-secret-hf', model: 'test-image-model' },
    youtube: { clientId: 'client-secret-id', refreshToken: 'refresh-secret', privacyStatus: 'private' },
    tiktok: { accessToken: 'tiktok-secret', privacyLevel: 'SELF_ONLY' },
    facebook: { pageId: '123', pageAccessToken: 'page-secret', videoState: 'DRAFT' },
  };
}

test('serves safe configuration and persisted job listings', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertical skit api '));
  const jobDir = path.join(outputDir, '2026-01-01-test-job');
  await fs.mkdir(jobDir);
  await fs.writeFile(path.join(jobDir, 'status.json'), JSON.stringify({
    state: 'completed',
    stage: 'ready_for_review',
    progress: 100,
    topic: 'API test job',
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
  await fs.writeFile(path.join(jobDir, 'video.mp4'), Buffer.from('safe-public-artifact'));

  const app = createApp({ runtimeConfig: testConfig(outputDir) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  try {
    const configuration = await (await fetch(`http://127.0.0.1:${port}/api/config`)).json();
    const serialized = JSON.stringify(configuration);
    assert.equal(configuration.channel.brand, 'Test Studio');
    assert.equal(configuration.integrations.youtube.configured, true);
    assert.ok(!serialized.includes('super-secret-hf'));
    assert.ok(!serialized.includes('refresh-secret'));

    const listing = await (await fetch(`http://127.0.0.1:${port}/api/jobs`)).json();
    assert.equal(listing.jobs.length, 1);
    assert.equal(listing.jobs[0].topic, 'API test job');

    const traversal = await fetch(`http://127.0.0.1:${port}/api/jobs/%2e%2e%2fsecret`);
    assert.ok([400, 404].includes(traversal.status));

    const video = await fetch(`http://127.0.0.1:${port}/media/2026-01-01-test-job/video.mp4`);
    assert.equal(video.status, 200);
    assert.equal(await video.text(), 'safe-public-artifact');
    const privateStatus = await fetch(`http://127.0.0.1:${port}/media/2026-01-01-test-job/status.json`);
    assert.equal(privateStatus.status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    const resolved = path.resolve(outputDir);
    if (resolved.startsWith(path.resolve(os.tmpdir())) && path.basename(resolved).startsWith('vertical skit api ')) {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }
});
