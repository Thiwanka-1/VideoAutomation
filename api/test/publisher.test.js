import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildTikTokChunkPlan, uploadFacebookReel } from '../src/publisher.js';

test('uploads small TikTok files in one chunk', () => {
  const plan = buildTikTokChunkPlan(4_000_000);
  assert.equal(plan.totalChunkCount, 1);
  assert.deepEqual(plan.chunks[0], { start: 0, end: 3_999_999, length: 4_000_000 });
});

test('leaves TikTok trailing bytes in the final chunk', () => {
  const plan = buildTikTokChunkPlan(70_000_123);
  assert.equal(plan.totalChunkCount, 2);
  assert.equal(plan.chunks[0].length, 32_000_000);
  assert.equal(plan.chunks[1].length, 38_000_123);
  assert.equal(plan.chunks[1].end, 70_000_122);
});

test('uses the Facebook Reel container, binary upload, and finish endpoints', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vertical skit facebook '));
  const videoPath = path.join(directory, 'video.mp4');
  await fs.writeFile(videoPath, Buffer.from('mock-video'));
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return Response.json({
        video_id: '12345',
        upload_url: 'https://rupload.facebook.com/video-upload/v24.0/12345',
      });
    }
    if (calls.length === 2) return Response.json({ success: true });
    return Response.json({ success: true });
  };

  try {
    const result = await uploadFacebookReel({
      videoPath,
      content: {
        metadata: {
          facebookTitle: 'A test Reel',
          facebookDescription: 'A description for the test Reel.',
          hashtags: ['#Test', '#Comedy', '#Original'],
        },
      },
      config: {
        facebook: {
          pageId: '999',
          pageAccessToken: 'page-token',
          graphVersion: 'v24.0',
          videoState: 'DRAFT',
        },
      },
      fetchImpl,
    });
    assert.equal(result.id, '12345');
    assert.match(calls[0].url, /^https:\/\/graph\.facebook\.com\/v24\.0\/999\/video_reels\?/);
    assert.match(calls[0].url, /upload_phase=start/);
    assert.equal(calls[1].url, 'https://rupload.facebook.com/video-upload/v24.0/12345');
    assert.equal(calls[1].options.headers.Authorization, 'OAuth page-token');
    assert.equal(calls[1].options.headers.offset, '0');
    assert.match(calls[2].url, /upload_phase=finish/);
    assert.match(calls[2].url, /video_state=DRAFT/);
  } finally {
    const resolved = path.resolve(directory);
    if (resolved.startsWith(path.resolve(os.tmpdir())) && path.basename(resolved).startsWith('vertical skit facebook ')) {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }
});
