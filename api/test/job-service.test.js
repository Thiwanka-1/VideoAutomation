import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JobService } from '../src/job-service.js';

async function waitFor(check, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for job state.');
}

test('persists asynchronous generation and publishing state', async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertical skit jobs '));
  const config = {
    outputDir,
    publishing: { dryRun: false, requireApproval: true, platforms: ['youtube'] },
  };
  let publishCalls = 0;
  const service = new JobService({
    config,
    runPipelineFn: async ({ jobDir, onProgress }) => {
      onProgress({ stage: 'generating_script', progress: 10, message: 'Writing' });
      await fs.writeFile(path.join(jobDir, 'video.mp4'), Buffer.from('mock-video'));
      await fs.writeFile(path.join(jobDir, 'content.json'), JSON.stringify({
        concept: 'A persisted test concept',
        metadata: { youtubeTitle: 'Persisted test episode' },
      }));
      await fs.writeFile(path.join(jobDir, 'manifest.json'), JSON.stringify({
        createdAt: new Date().toISOString(),
        topic: 'Persistence',
        durationSeconds: 60,
        reviewStatus: 'NEEDS_HUMAN_REVIEW',
      }));
    },
    publishJobFn: async () => {
      publishCalls += 1;
      return { youtube: { ok: true } };
    },
  });

  try {
    const accepted = await service.startGeneration('Persistence');
    assert.ok(['queued', 'running'].includes(accepted.status.state));
    const completed = await waitFor(async () => {
      const job = await service.getJob(accepted.id);
      return job.status.state === 'completed' ? job : null;
    });
    assert.equal(completed.content.metadata.youtubeTitle, 'Persisted test episode');
    assert.match(completed.artifacts.video, /video\.mp4$/);

    const publishing = await service.startPublishing({
      id: completed.id,
      platforms: ['youtube'],
      approved: true,
    });
    assert.equal(publishing.status.state, 'publishing');
    await waitFor(async () => (await service.getJob(completed.id)).status.stage === 'published');
    assert.equal(publishCalls, 1);
  } finally {
    const resolved = path.resolve(outputDir);
    if (resolved.startsWith(path.resolve(os.tmpdir())) && path.basename(resolved).startsWith('vertical skit jobs ')) {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }
});
