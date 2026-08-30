import path from 'node:path';
import { ffmpeg, probe, runFfmpeg } from './media.js';

export function escapeSubtitleFilterPath(filePath) {
  return path.resolve(filePath)
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

export async function assembleVideo({ imagePath, audioPath, subtitlePath, outputPath, config }) {
  const { width, height, fps, targetDurationSeconds } = config.video;
  const subtitleFile = escapeSubtitleFilterPath(subtitlePath);
  const style = [
    'FontName=Arial',
    'FontSize=22',
    'Bold=1',
    'PrimaryColour=&H00FFFFFF',
    'OutlineColour=&H00000000',
    'BackColour=&H80000000',
    'BorderStyle=3',
    'Outline=2',
    'Shadow=1',
    'Alignment=2',
    'MarginV=170',
  ].join(',');

  const filters = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},` +
      `zoompan=z='min(zoom+0.00035,1.05)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}[moving]`,
    `[moving]subtitles=filename='${subtitleFile}':force_style='${style}'[v]`,
  ];

  const command = ffmpeg()
    .input(imagePath)
    .inputOptions(['-loop 1'])
    .input(audioPath)
    .complexFilter(filters)
    .outputOptions([
      '-map', '[v]',
      '-map', '1:a:0',
      '-t', String(targetDurationSeconds),
      '-shortest',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-preset', 'medium',
      '-crf', '20',
      '-r', String(fps),
      '-y',
    ])
    .videoCodec('libx264')
    .audioCodec('aac')
    .audioBitrate('128k')
    .format('mp4')
    .output(outputPath);

  await runFfmpeg(command, 'render vertical video');
  await validateVideo(outputPath, config);
  return outputPath;
}

export async function validateVideo(filePath, config) {
  const metadata = await probe(filePath);
  const video = metadata.streams.find((stream) => stream.codec_type === 'video');
  const audio = metadata.streams.find((stream) => stream.codec_type === 'audio');
  const duration = Number(metadata.format.duration);
  const problems = [];
  if (!video) problems.push('missing video stream');
  if (!audio) problems.push('missing audio stream');
  if (video && (video.width !== config.video.width || video.height !== config.video.height)) {
    problems.push(`expected ${config.video.width}x${config.video.height}, got ${video.width}x${video.height}`);
  }
  if (!Number.isFinite(duration) || Math.abs(duration - config.video.targetDurationSeconds) > 0.2) {
    problems.push(`expected about ${config.video.targetDurationSeconds}s, got ${duration}s`);
  }
  if (problems.length) throw new Error(`Rendered video validation failed: ${problems.join('; ')}`);
  return metadata;
}
