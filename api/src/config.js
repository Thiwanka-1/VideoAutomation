import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(sourceDir, '..');

function boolean(value, fallback = false) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function integer(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function number(value, fallback) {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csv(value, fallback = []) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback;
}

function topics(value) {
  return value ? value.split('|').map((item) => item.trim()).filter(Boolean) : [];
}

export function loadConfig(env = process.env) {
  return {
    projectRoot,
    outputDir: path.resolve(projectRoot, env.OUTPUT_DIR || 'output'),
    api: {
      host: env.API_HOST || '127.0.0.1',
      port: integer(env.API_PORT, 4000),
      allowedOrigins: csv(env.API_ALLOWED_ORIGINS, [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ]),
    },
    channel: {
      brand: env.CHANNEL_BRAND || 'Runtime Roommates',
      niche: env.CHANNEL_NICHE || 'original workplace and software-engineering comedy skits',
      language: env.CONTENT_LANGUAGE || 'English',
    },
    ollama: {
      baseUrl: (env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
      model: env.OLLAMA_MODEL || 'qwen2.5:7b',
    },
    huggingFace: {
      token: env.HF_TOKEN,
      model: env.HF_MODEL || 'black-forest-labs/FLUX.1-schnell',
      provider: env.HF_PROVIDER || 'hf-inference',
      width: integer(env.HF_IMAGE_WIDTH, 768),
      height: integer(env.HF_IMAGE_HEIGHT, 1344),
    },
    tts: {
      language: env.TTS_LANGUAGE || 'en',
      slow: boolean(env.TTS_SLOW),
      lineGapSeconds: number(env.TTS_LINE_GAP_SECONDS, 0.25),
    },
    video: {
      targetDurationSeconds: number(env.TARGET_DURATION_SECONDS, 60),
      width: 1080,
      height: 1920,
      fps: 30,
    },
    publishing: {
      dryRun: boolean(env.DRY_RUN, true),
      requireApproval: boolean(env.REQUIRE_APPROVAL, true),
      platforms: csv(env.PUBLISH_PLATFORMS, ['youtube', 'tiktok', 'facebook']),
    },
    schedule: {
      cron: env.SCHEDULE_CRON || '0 18 * * *',
      timezone: env.SCHEDULE_TIMEZONE || 'UTC',
      topics: topics(env.SCHEDULE_TOPICS),
      publish: boolean(env.PUBLISH_ON_SCHEDULE),
    },
    youtube: {
      clientId: env.YOUTUBE_CLIENT_ID,
      clientSecret: env.YOUTUBE_CLIENT_SECRET,
      redirectUri: env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
      refreshToken: env.YOUTUBE_REFRESH_TOKEN,
      privacyStatus: env.YOUTUBE_PRIVACY_STATUS || 'private',
      categoryId: env.YOUTUBE_CATEGORY_ID || '23',
      notifySubscribers: boolean(env.YOUTUBE_NOTIFY_SUBSCRIBERS),
      containsSyntheticMedia: boolean(env.YOUTUBE_CONTAINS_SYNTHETIC_MEDIA, true),
    },
    tiktok: {
      accessToken: env.TIKTOK_ACCESS_TOKEN,
      privacyLevel: env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY',
      disableComment: boolean(env.TIKTOK_DISABLE_COMMENT),
      disableDuet: boolean(env.TIKTOK_DISABLE_DUET),
      disableStitch: boolean(env.TIKTOK_DISABLE_STITCH),
      aiGenerated: boolean(env.TIKTOK_AI_GENERATED, true),
    },
    facebook: {
      pageId: env.FACEBOOK_PAGE_ID,
      pageAccessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN,
      graphVersion: env.FACEBOOK_GRAPH_VERSION || 'v24.0',
      videoState: env.FACEBOOK_VIDEO_STATE || 'DRAFT',
    },
  };
}

export function assertConfigured(name, entries) {
  const missing = Object.entries(entries)
    .filter(([, value]) => !value || String(value).toLowerCase() === 'replace_me')
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`${name} is missing configuration: ${missing.join(', ')}`);
  }
}

export const config = loadConfig();
