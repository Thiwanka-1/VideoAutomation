import fs from 'node:fs/promises';
import path from 'node:path';
import { publishJob, runPipeline } from './pipeline.js';
import { createJobDirectory, readJson, writeJson } from './utils.js';

export class JobNotFoundError extends Error {}
export class JobConflictError extends Error {}
export class JobValidationError extends Error {}

async function readOptional(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class JobService {
  constructor({ config, runPipelineFn = runPipeline, publishJobFn = publishJob }) {
    this.config = config;
    this.runPipeline = runPipelineFn;
    this.publishJob = publishJobFn;
    this.active = new Map();
  }

  resolveJobDir(id) {
    if (!id || path.basename(id) !== id || !/^[a-zA-Z0-9._-]+$/.test(id)) {
      throw new JobValidationError('Invalid job identifier.');
    }
    const outputRoot = path.resolve(this.config.outputDir);
    const jobDir = path.resolve(outputRoot, id);
    if (!jobDir.startsWith(`${outputRoot}${path.sep}`)) {
      throw new JobValidationError('Job path is outside the output directory.');
    }
    return jobDir;
  }

  async writeStatus(jobDir, update) {
    const statusPath = path.join(jobDir, 'status.json');
    const previous = await readOptional(statusPath) || {};
    const next = {
      ...previous,
      ...update,
      id: path.basename(jobDir),
      createdAt: previous.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeJson(statusPath, next);
    return next;
  }

  async getJob(id) {
    const jobDir = this.resolveJobDir(id);
    const info = await fs.stat(jobDir).catch((error) => {
      if (error.code === 'ENOENT') throw new JobNotFoundError(`Job ${id} was not found.`);
      throw error;
    });
    if (!info.isDirectory()) throw new JobNotFoundError(`Job ${id} was not found.`);

    const [statusFile, content, manifest, publishResults] = await Promise.all([
      readOptional(path.join(jobDir, 'status.json')),
      readOptional(path.join(jobDir, 'content.json')),
      readOptional(path.join(jobDir, 'manifest.json')),
      readOptional(path.join(jobDir, 'publish-results.json')),
    ]);
    const fallbackStatus = manifest
      ? { state: 'completed', stage: 'ready_for_review', progress: 100, message: 'Video ready for review' }
      : { state: 'queued', stage: 'queued', progress: 0, message: 'Waiting to start' };
    const status = { id, ...fallbackStatus, ...statusFile };
    if (['queued', 'running', 'publishing'].includes(status.state) && !this.active.has(id)) {
      Object.assign(status, {
        state: 'failed',
        stage: 'interrupted',
        message: 'The API stopped before this job finished',
        error: 'Start a new job. Completed artifacts, if any, were preserved.',
      });
    }
    const mediaBase = `/media/${encodeURIComponent(id)}`;
    const candidates = {
      video: 'video.mp4',
      image: 'background.png',
      audio: 'dialogue.mp3',
      subtitles: 'subtitles.srt',
    };
    const artifacts = {};
    for (const [name, fileName] of Object.entries(candidates)) {
      if (await fileExists(path.join(jobDir, fileName))) artifacts[name] = `${mediaBase}/${fileName}`;
    }

    return {
      id,
      status,
      topic: status.topic || manifest?.topic || content?.concept || 'Untitled episode',
      content,
      manifest: manifest ? {
        createdAt: manifest.createdAt,
        durationSeconds: manifest.durationSeconds,
        reviewStatus: manifest.reviewStatus,
      } : null,
      publishResults,
      artifacts,
    };
  }

  async listJobs() {
    await fs.mkdir(this.config.outputDir, { recursive: true });
    const entries = await fs.readdir(this.config.outputDir, { withFileTypes: true });
    const jobs = await Promise.all(entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.getJob(entry.name).catch(() => null)));
    return jobs
      .filter(Boolean)
      .sort((a, b) => String(b.status.createdAt || b.id).localeCompare(String(a.status.createdAt || a.id)))
      .map((job) => ({
        id: job.id,
        topic: job.topic,
        title: job.content?.metadata?.youtubeTitle || job.topic,
        concept: job.content?.concept,
        status: job.status,
        artifacts: job.artifacts,
        publishResults: job.publishResults,
      }));
  }

  async startGeneration(topic) {
    if ([...this.active.values()].includes('generating')) {
      throw new JobConflictError('A generation job is already running on this local worker.');
    }
    const jobDir = await createJobDirectory(this.config.outputDir, topic || 'auto-topic');
    const id = path.basename(jobDir);
    await this.writeStatus(jobDir, {
      topic: topic || 'Ollama-selected topic',
      state: 'queued',
      stage: 'queued',
      progress: 0,
      message: 'Queued on the local generation worker',
      error: null,
    });
    this.active.set(id, 'generating');
    let statusUpdates = Promise.resolve();

    void this.runPipeline({
      topic,
      publish: false,
      config: this.config,
      jobDir,
      onProgress: (progress) => {
        statusUpdates = statusUpdates.then(() => this.writeStatus(
          jobDir,
          { ...progress, state: 'running', error: null },
        ));
      },
    }).then(async () => {
      await statusUpdates;
      await this.writeStatus(jobDir, {
        state: 'completed',
        stage: 'ready_for_review',
        progress: 100,
        message: 'Video ready for human review',
      });
    }).catch(async (error) => {
      await statusUpdates.catch(() => {});
      await this.writeStatus(jobDir, {
        state: 'failed',
        stage: 'failed',
        message: 'Generation failed',
        error: error.message,
      });
    }).finally(() => {
      this.active.delete(id);
    });

    return this.getJob(id);
  }

  async startPublishing({ id, platforms, approved }) {
    const job = await this.getJob(id);
    if (!job.artifacts.video) throw new JobConflictError('This job has no completed video to publish.');
    if (this.active.has(id)) throw new JobConflictError('This job is already being processed.');
    if (this.config.publishing.requireApproval && !approved) {
      throw new JobValidationError('Confirm that you reviewed the complete video before publishing.');
    }
    this.active.set(id, 'publishing');
    const jobDir = this.resolveJobDir(id);
    await this.writeStatus(jobDir, {
      state: 'publishing',
      stage: 'publishing',
      progress: 95,
      message: 'Uploading to selected platforms',
      error: null,
    });

    void this.publishJob({ jobDir, config: this.config, approved, platforms })
      .then(async (result) => {
        await this.writeStatus(jobDir, {
          state: 'completed',
          stage: 'published',
          progress: 100,
          message: result?.skipped ? result.reason : 'Publishing requests completed',
          error: null,
        });
      })
      .catch(async (error) => {
        await this.writeStatus(jobDir, {
          state: 'publish_failed',
          stage: 'publish_failed',
          progress: 100,
          message: 'The video is safe, but one or more uploads failed',
          error: error.message,
        });
      })
      .finally(() => this.active.delete(id));

    return this.getJob(id);
  }
}
