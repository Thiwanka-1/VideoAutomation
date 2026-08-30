import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assembleVideo } from '../src/editor.js';
import { ffmpeg, probe, runFfmpeg } from '../src/media.js';

test('renders a validated vertical MP4 with burned subtitles', { timeout: 120_000 }, async () => {
  const jobDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vertical skit '));
  const imagePath = path.join(jobDir, 'background.png');
  const audioPath = path.join(jobDir, 'dialogue.mp3');
  const subtitlePath = path.join(jobDir, 'subtitles.srt');
  const outputPath = path.join(jobDir, 'video.mp4');
  const config = { video: { width: 1080, height: 1920, fps: 30, targetDurationSeconds: 2 } };

  try {
    await runFfmpeg(
      ffmpeg()
        .input('color=c=0x203050:s=768x1344:d=1')
        .inputFormat('lavfi')
        .frames(1)
        .outputOptions('-y')
        .output(imagePath),
      'create integration-test image',
    );
    await runFfmpeg(
      ffmpeg()
        .input('sine=frequency=440:duration=2')
        .inputFormat('lavfi')
        .audioCodec('libmp3lame')
        .outputOptions('-y')
        .output(audioPath),
      'create integration-test audio',
    );
    await fs.writeFile(
      subtitlePath,
      '1\n00:00:00,000 --> 00:00:01,800\nADA: Integration test subtitle\n',
      'utf8',
    );

    await assembleVideo({ imagePath, audioPath, subtitlePath, outputPath, config });
    const metadata = await probe(outputPath);
    assert.equal(metadata.streams.find((stream) => stream.codec_type === 'video').width, 1080);
    assert.equal(metadata.streams.find((stream) => stream.codec_type === 'video').height, 1920);
    assert.ok(metadata.streams.some((stream) => stream.codec_type === 'audio'));
  } finally {
    const resolved = path.resolve(jobDir);
    if (resolved.startsWith(path.resolve(os.tmpdir())) && path.basename(resolved).startsWith('vertical skit ')) {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }
});
