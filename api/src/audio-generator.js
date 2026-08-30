import fs from 'node:fs/promises';
import path from 'node:path';
import googleTTS from 'google-tts-api';
import { ffmpeg, probeDuration, runFfmpeg } from './media.js';

async function download(url, outputPath, fetchImpl, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${await response.text()}`);
      await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`TTS download failed after ${attempts} attempts: ${lastError.message}`);
}

function createSilence(outputPath, duration) {
  const command = ffmpeg()
    .input('anullsrc=r=24000:cl=mono')
    .inputFormat('lavfi')
    .duration(duration)
    .audioCodec('libmp3lame')
    .audioBitrate('96k')
    .outputOptions('-y')
    .output(outputPath);
  return runFfmpeg(command, 'create dialogue pause');
}

function combineAudio({ inputs, outputPath, speedFactor, targetDuration }) {
  const command = ffmpeg();
  inputs.forEach((input) => command.input(input));

  const labels = inputs.map((_, index) => `${index}:a`);
  const filters = [{
    filter: 'concat',
    options: { n: inputs.length, v: 0, a: 1 },
    inputs: labels,
    outputs: 'joined',
  }];

  let current = 'joined';
  if (speedFactor > 1.0001) {
    filters.push({ filter: 'atempo', options: speedFactor.toFixed(6), inputs: current, outputs: 'paced' });
    current = 'paced';
  }
  if (targetDuration) {
    filters.push({ filter: 'apad', options: { whole_dur: targetDuration }, inputs: current, outputs: 'padded' });
    filters.push({ filter: 'atrim', options: { duration: targetDuration }, inputs: 'padded', outputs: 'audio' });
    current = 'audio';
  }

  command
    .complexFilter(filters)
    .outputOptions(['-map', `[${current}]`, '-y'])
    .audioCodec('libmp3lame')
    .audioBitrate('128k')
    .output(outputPath);
  return runFfmpeg(command, 'assemble dialogue audio');
}

export function calculateTimeline(durations, targetDuration, baseGap = 0.25) {
  if (!durations.length) throw new Error('At least one dialogue duration is required.');
  const lineTotal = durations.reduce((sum, duration) => sum + duration, 0);
  const gapCount = Math.max(0, durations.length - 1);
  let gap = gapCount ? baseGap : 0;

  if (targetDuration && gapCount && lineTotal + gap * gapCount < targetDuration) {
    gap = Math.min(1.25, Math.max(baseGap, (targetDuration - lineTotal) / gapCount));
  }

  const naturalDuration = lineTotal + gap * gapCount;
  const speedFactor = targetDuration && naturalDuration > targetDuration
    ? naturalDuration / targetDuration
    : 1;

  let cursor = 0;
  const timings = durations.map((duration, index) => {
    const start = cursor / speedFactor;
    const end = (cursor + duration) / speedFactor;
    cursor += duration + (index < durations.length - 1 ? gap : 0);
    return { start, end };
  });

  return {
    gapSeconds: gap,
    naturalDuration,
    speedFactor,
    targetDuration: targetDuration || naturalDuration,
    timings,
  };
}

export async function generateDialogueAudio({ dialogue, jobDir, config, fetchImpl = fetch }) {
  const partsDir = path.join(jobDir, 'audio-parts');
  await fs.mkdir(partsDir, { recursive: true });

  const lineFiles = [];
  for (const [index, line] of dialogue.entries()) {
    const outputPath = path.join(partsDir, `${String(index + 1).padStart(2, '0')}.mp3`);
    const url = googleTTS.getAudioUrl(line.text, {
      lang: config.tts.language,
      slow: config.tts.slow,
      host: 'https://translate.google.com',
    });
    await download(url, outputPath, fetchImpl);
    lineFiles.push(outputPath);
  }

  const durations = [];
  for (const lineFile of lineFiles) durations.push(await probeDuration(lineFile));
  const timeline = calculateTimeline(
    durations,
    config.video.targetDurationSeconds,
    config.tts.lineGapSeconds,
  );

  const inputs = [];
  let silencePath;
  if (lineFiles.length > 1 && timeline.gapSeconds > 0) {
    silencePath = path.join(partsDir, 'pause.mp3');
    await createSilence(silencePath, timeline.gapSeconds);
  }
  lineFiles.forEach((lineFile, index) => {
    inputs.push(lineFile);
    if (silencePath && index < lineFiles.length - 1) inputs.push(silencePath);
  });

  const outputPath = path.join(jobDir, 'dialogue.mp3');
  await combineAudio({
    inputs,
    outputPath,
    speedFactor: timeline.speedFactor,
    targetDuration: timeline.targetDuration,
  });

  return { outputPath, ...timeline };
}
