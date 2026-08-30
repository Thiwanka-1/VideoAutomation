import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { calculateTimeline, generateDialogueAudio } from '../src/audio-generator.js';
import { ffmpeg, probeDuration, runFfmpeg } from '../src/media.js';

test('distributes pauses while keeping a fixed target duration', () => {
  const result = calculateTimeline([10, 10, 10, 10, 10], 60, 0.25);
  assert.equal(result.speedFactor, 1);
  assert.equal(result.gapSeconds, 1.25);
  assert.equal(result.timings[0].start, 0);
  assert.equal(result.timings.at(-1).end, 55);
  assert.equal(result.targetDuration, 60);
});

test('speeds up dialogue that would exceed the target', () => {
  const result = calculateTimeline([31, 31], 60, 0.25);
  assert.ok(result.speedFactor > 1);
  assert.ok(Math.abs(result.timings.at(-1).end - 60) < 0.001);
});

test('assembles mocked TTS responses into target-length audio', { timeout: 60_000 }, async () => {
  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertical skit audio '));
  const sourcePath = path.join(jobDir, 'source.mp3');
  try {
    await runFfmpeg(
      ffmpeg()
        .input('sine=frequency=550:duration=0.6')
        .inputFormat('lavfi')
        .audioCodec('libmp3lame')
        .outputOptions('-y')
        .output(sourcePath),
      'create mocked TTS audio',
    );
    const bytes = await fs.readFile(sourcePath);
    const result = await generateDialogueAudio({
      dialogue: [
        { character: 'Ada', text: 'The test has started.' },
        { character: 'Lin', text: 'And the audio is complete.' },
      ],
      jobDir,
      config: {
        tts: { language: 'en', slow: false, lineGapSeconds: 0.25 },
        video: { targetDurationSeconds: 2 },
      },
      fetchImpl: async () => new Response(bytes, { status: 200, headers: { 'Content-Type': 'audio/mpeg' } }),
    });
    assert.ok(Math.abs((await probeDuration(result.outputPath)) - 2) < 0.1);
    assert.equal(result.timings.length, 2);
  } finally {
    const resolved = path.resolve(jobDir);
    if (resolved.startsWith(path.resolve(os.tmpdir())) && path.basename(resolved).startsWith('vertical skit audio ')) {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }
});
