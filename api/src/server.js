import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import {
  JobConflictError,
  JobNotFoundError,
  JobService,
  JobValidationError,
} from './job-service.js';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const allowedPlatforms = ['youtube', 'tiktok', 'facebook'];

function configurationSummary(runtimeConfig) {
  const configured = (value) => Boolean(value && String(value).toLowerCase() !== 'replace_me');
  return {
    channel: runtimeConfig.channel,
    video: runtimeConfig.video,
    safety: {
      dryRun: runtimeConfig.publishing.dryRun,
      requireApproval: runtimeConfig.publishing.requireApproval,
    },
    publishingPlatforms: runtimeConfig.publishing.platforms,
    integrations: {
      ollama: { configured: true, model: runtimeConfig.ollama.model },
      huggingFace: { configured: configured(runtimeConfig.huggingFace.token), model: runtimeConfig.huggingFace.model },
      youtube: {
        configured: configured(runtimeConfig.youtube.clientId) && configured(runtimeConfig.youtube.refreshToken),
        visibility: runtimeConfig.youtube.privacyStatus,
      },
      tiktok: {
        configured: configured(runtimeConfig.tiktok.accessToken),
        visibility: runtimeConfig.tiktok.privacyLevel,
      },
      facebook: {
        configured: configured(runtimeConfig.facebook.pageId) && configured(runtimeConfig.facebook.pageAccessToken),
        visibility: runtimeConfig.facebook.videoState,
      },
    },
  };
}

export function createApp({ runtimeConfig = config, jobService } = {}) {
  const app = express();
  const jobs = jobService || new JobService({ config: runtimeConfig });

  app.disable('x-powered-by');
  app.use(cors({ origin: runtimeConfig.api.allowedOrigins, credentials: false }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/media/:id/:file', (request, response, next) => {
    const allowedFiles = ['video.mp4', 'background.png', 'dialogue.mp3', 'subtitles.srt'];
    if (!allowedFiles.includes(request.params.file)) {
      response.status(404).json({ error: 'Artifact was not found.' });
      return;
    }
    let jobDir;
    try {
      jobDir = jobs.resolveJobDir(request.params.id);
    } catch (error) {
      next(error);
      return;
    }
    response.sendFile(path.join(jobDir, request.params.file), {
      dotfiles: 'deny',
      maxAge: '1h',
    }, (error) => {
      if (error) next(error);
    });
  });

  app.get('/api/health', async (_request, response) => {
    let ollama = { reachable: false, modelInstalled: false };
    try {
      const upstream = await fetch(`${runtimeConfig.ollama.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (upstream.ok) {
        const payload = await upstream.json();
        const names = (payload.models || []).flatMap((model) => [model.name, model.model]);
        ollama = {
          reachable: true,
          modelInstalled: names.some((name) => name === runtimeConfig.ollama.model || name?.startsWith(`${runtimeConfig.ollama.model}:`)),
        };
      }
    } catch {
      // A stopped local Ollama worker is reported as degraded, not as an API crash.
    }
    response.json({
      ok: true,
      service: 'vertical-skit-api',
      time: new Date().toISOString(),
      ollama,
    });
  });

  app.get('/api/config', (_request, response) => {
    response.json(configurationSummary(runtimeConfig));
  });

  app.get('/api/docs/setup', (_request, response) => {
    response.type('text/markdown').sendFile(path.resolve(sourceDir, '../docs/PLATFORM_SETUP.md'));
  });

  app.get('/api/jobs', async (_request, response) => {
    response.json({ jobs: await jobs.listJobs() });
  });

  app.get('/api/jobs/:id', async (request, response) => {
    response.json(await jobs.getJob(request.params.id));
  });

  app.post('/api/jobs', async (request, response) => {
    const topic = typeof request.body?.topic === 'string' ? request.body.topic.trim() : '';
    if (topic.length > 300) throw new JobValidationError('Topic must be 300 characters or fewer.');
    const job = await jobs.startGeneration(topic || undefined);
    response.status(202).json(job);
  });

  app.post('/api/jobs/:id/publish', async (request, response) => {
    const requested = Array.isArray(request.body?.platforms)
      ? [...new Set(request.body.platforms.map(String))]
      : runtimeConfig.publishing.platforms;
    const invalid = requested.filter((platform) => !allowedPlatforms.includes(platform));
    if (!requested.length || invalid.length) {
      throw new JobValidationError(`Choose one or more valid platforms: ${allowedPlatforms.join(', ')}.`);
    }
    const job = await jobs.startPublishing({
      id: request.params.id,
      platforms: requested,
      approved: request.body?.approved === true,
    });
    response.status(202).json(job);
  });

  const clientDist = path.resolve(sourceDir, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false }));
    app.use((request, response, next) => {
      if (!['GET', 'HEAD'].includes(request.method) || request.path.startsWith('/api/') || request.path.startsWith('/media/')) {
        next();
        return;
      }
      response.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use((error, _request, response, _next) => {
    const status = error instanceof JobNotFoundError || error.status === 404 ? 404
      : error instanceof JobConflictError ? 409
        : error instanceof JobValidationError ? 400
          : 500;
    if (status === 500) console.error(error);
    response.status(status).json({ error: error.message || 'Unexpected server error.' });
  });

  return app;
}

export function startServer(runtimeConfig = config) {
  const app = createApp({ runtimeConfig });
  return app.listen(runtimeConfig.api.port, runtimeConfig.api.host, () => {
    console.log(`Vertical Skit Studio API: http://${runtimeConfig.api.host}:${runtimeConfig.api.port}`);
    console.log(`Publishing safety: DRY_RUN=${runtimeConfig.publishing.dryRun}, REQUIRE_APPROVAL=${runtimeConfig.publishing.requireApproval}`);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
