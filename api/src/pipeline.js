import path from 'node:path';
import { generateDialogueAudio } from './audio-generator.js';
import { assembleVideo } from './editor.js';
import { generateSkit } from './generator.js';
import { generateBackground } from './image-generator.js';
import { publishToPlatforms } from './publisher.js';
import { writeSubtitles } from './subtitles.js';
import { createJobDirectory, readJson, writeJson } from './utils.js';

export async function createVideo({ topic, config, jobDir: requestedJobDir, onProgress = () => {} }) {
  onProgress({ stage: 'generating_script', progress: 10, message: 'Writing the episode with Ollama' });
  console.log('[1/5] Generating an original structured script with Ollama...');
  const content = await generateSkit({ topic, config });
  const jobDir = requestedJobDir || await createJobDirectory(
    config.outputDir,
    topic || content.metadata.youtubeTitle,
  );
  await writeJson(path.join(jobDir, 'content.json'), content);

  onProgress({ stage: 'generating_image', progress: 30, message: 'Creating the vertical background' });
  console.log('[2/5] Generating the background with Hugging Face...');
  const imagePath = path.join(jobDir, 'background.png');
  await generateBackground({ prompt: content.visualScenePrompt, outputPath: imagePath, config });

  onProgress({ stage: 'generating_audio', progress: 50, message: 'Synthesizing and timing dialogue' });
  console.log('[3/5] Synthesizing dialogue and measuring line timings...');
  const audio = await generateDialogueAudio({ dialogue: content.dialogue, jobDir, config });
  await writeJson(path.join(jobDir, 'audio-timeline.json'), audio);

  onProgress({ stage: 'writing_subtitles', progress: 68, message: 'Building timed subtitles' });
  console.log('[4/5] Writing subtitles...');
  const subtitlePath = path.join(jobDir, 'subtitles.srt');
  await writeSubtitles({ dialogue: content.dialogue, timings: audio.timings, outputPath: subtitlePath });

  onProgress({ stage: 'rendering_video', progress: 78, message: 'Rendering the final 9:16 video' });
  console.log('[5/5] Rendering and validating the 1080x1920 video...');
  const videoPath = path.join(jobDir, 'video.mp4');
  await assembleVideo({
    imagePath,
    audioPath: audio.outputPath,
    subtitlePath,
    outputPath: videoPath,
    config,
  });

  const manifest = {
    createdAt: new Date().toISOString(),
    topic: topic || content.concept,
    videoPath,
    imagePath,
    audioPath: audio.outputPath,
    subtitlePath,
    durationSeconds: config.video.targetDurationSeconds,
    reviewStatus: 'NEEDS_HUMAN_REVIEW',
  };
  await writeJson(path.join(jobDir, 'manifest.json'), manifest);
  onProgress({ stage: 'ready_for_review', progress: 100, message: 'Video ready for human review' });
  return { jobDir, videoPath, content, manifest };
}

export async function publishJob({ jobDir, config, approved = false, platforms }) {
  if (config.publishing.dryRun) {
    return { skipped: true, reason: 'DRY_RUN=true; no platform API was called.' };
  }
  if (config.publishing.requireApproval && !approved) {
    throw new Error('Publishing is locked by REQUIRE_APPROVAL=true. Review the video, then pass --approve.');
  }

  const content = await readJson(path.join(jobDir, 'content.json'));
  const manifest = await readJson(path.join(jobDir, 'manifest.json'));
  return publishToPlatforms({
    jobDir,
    videoPath: manifest.videoPath || path.join(jobDir, 'video.mp4'),
    content,
    config,
    platforms,
  });
}

export async function runPipeline({
  topic,
  publish = false,
  approved = false,
  config,
  platforms,
  jobDir,
  onProgress,
}) {
  const generated = await createVideo({ topic, config, jobDir, onProgress });
  if (!publish) return generated;
  const publishResults = await publishJob({
    jobDir: generated.jobDir,
    config,
    approved,
    platforms,
  });
  return { ...generated, publishResults };
}
