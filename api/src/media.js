import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

if (!ffmpegPath || !ffprobeStatic?.path) {
  throw new Error('Bundled FFmpeg binaries were not found. Reinstall ffmpeg-static and ffprobe-static.');
}

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);

export { ffmpeg };

export function probe(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

export async function probeDuration(filePath) {
  const metadata = await probe(filePath);
  const duration = Number(metadata?.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine media duration for ${filePath}`);
  }
  return duration;
}

export function runFfmpeg(command, label) {
  return new Promise((resolve, reject) => {
    command
      .on('start', (line) => console.log(`[ffmpeg] ${label}: ${line}`))
      .on('error', (error, stdout, stderr) => {
        const detail = stderr?.trim().split('\n').slice(-8).join('\n');
        reject(new Error(`${label} failed: ${error.message}${detail ? `\n${detail}` : ''}`));
      })
      .on('end', resolve)
      .run();
  });
}
