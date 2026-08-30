import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { assertConfigured } from './config.js';
import { probeDuration } from './media.js';
import { TikTokTokenManager, withTikTokAuthRetry } from './tiktok-token-manager.js';
import { readJson, truncate, withHashtags, writeJson } from './utils.js';

const TIKTOK_API = 'https://open.tiktokapis.com';

async function parseApiResponse(response, label) {
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${label} failed (${response.status}): ${truncate(text, 1000)}`);
  }
  return data;
}

class TikTokApiError extends Error {
  constructor({ label, status, code, message }) {
    super(`${label} failed (${status}): ${code} - ${message}`);
    this.name = 'TikTokApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseTikTokResponse(response, label) {
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  const code = payload?.error?.code || (response.ok ? 'ok' : 'unknown_error');
  if (!response.ok || code !== 'ok') {
    throw new TikTokApiError({
      label,
      status: response.status,
      code,
      message: payload?.error?.message || truncate(text, 1000) || 'unknown error',
    });
  }
  return payload;
}

async function authenticatedTikTokRequest({ manager, fetchImpl, url, label, body }) {
  return withTikTokAuthRetry(manager, async (accessToken) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    return parseTikTokResponse(response, label);
  });
}

export async function uploadYouTube({ videoPath, content, config }) {
  assertConfigured('YouTube', {
    YOUTUBE_CLIENT_ID: config.youtube.clientId,
    YOUTUBE_CLIENT_SECRET: config.youtube.clientSecret,
    YOUTUBE_REFRESH_TOKEN: config.youtube.refreshToken,
  });

  const oauth = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    config.youtube.redirectUri,
  );
  oauth.setCredentials({ refresh_token: config.youtube.refreshToken });
  const youtube = google.youtube({ version: 'v3', auth: oauth });
  const tags = content.metadata.hashtags.map((tag) => tag.replace(/^#/, ''));

  const response = await youtube.videos.insert({
    part: ['snippet', 'status'],
    notifySubscribers: config.youtube.notifySubscribers,
    requestBody: {
      snippet: {
        title: content.metadata.youtubeTitle,
        description: withHashtags(content.metadata.youtubeDescription, content.metadata.hashtags),
        categoryId: config.youtube.categoryId,
        tags,
        defaultLanguage: config.channel.language.toLowerCase() === 'english' ? 'en' : undefined,
      },
      status: {
        privacyStatus: config.youtube.privacyStatus,
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: config.youtube.containsSyntheticMedia,
      },
    },
    media: {
      mimeType: 'video/mp4',
      body: fs.createReadStream(videoPath),
    },
  });

  return {
    platform: 'youtube',
    id: response.data.id,
    privacyStatus: response.data.status?.privacyStatus || config.youtube.privacyStatus,
    url: response.data.id ? `https://www.youtube.com/shorts/${response.data.id}` : undefined,
  };
}

export function buildTikTokChunkPlan(fileSize) {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) throw new Error('TikTok file size must be positive.');
  const maxSingleChunk = 64_000_000;
  const standardChunk = 32_000_000;
  const chunkSize = fileSize <= maxSingleChunk ? fileSize : standardChunk;
  const totalChunkCount = fileSize <= maxSingleChunk ? 1 : Math.floor(fileSize / chunkSize);
  const chunks = [];
  let start = 0;
  for (let index = 0; index < totalChunkCount; index += 1) {
    const isLast = index === totalChunkCount - 1;
    const end = isLast ? fileSize - 1 : start + chunkSize - 1;
    chunks.push({ start, end, length: end - start + 1 });
    start = end + 1;
  }
  return { chunkSize, totalChunkCount, chunks };
}

async function queryTikTokCreator(manager, fetchImpl) {
  return authenticatedTikTokRequest({
    manager,
    fetchImpl,
    url: `${TIKTOK_API}/v2/post/publish/creator_info/query/`,
    label: 'TikTok creator query',
    body: '{}',
  });
}

export async function fetchTikTokPublishStatus({ publishId, config, fetchImpl = fetch }) {
  const manager = new TikTokTokenManager({ config, fetchImpl });
  return authenticatedTikTokRequest({
    manager,
    fetchImpl,
    url: `${TIKTOK_API}/v2/post/publish/status/fetch/`,
    label: 'TikTok status query',
    body: JSON.stringify({ publish_id: publishId }),
  });
}

export async function uploadTikTok({ videoPath, content, config, fetchImpl = fetch }) {
  const manager = new TikTokTokenManager({ config, fetchImpl });
  const creator = await queryTikTokCreator(manager, fetchImpl);
  const allowedPrivacy = creator?.data?.privacy_level_options || [];
  if (allowedPrivacy.length && !allowedPrivacy.includes(config.tiktok.privacyLevel)) {
    throw new Error(`TikTok privacy ${config.tiktok.privacyLevel} is unavailable. Allowed: ${allowedPrivacy.join(', ')}`);
  }

  const duration = await probeDuration(videoPath);
  const maximum = Number(creator?.data?.max_video_post_duration_sec);
  if (Number.isFinite(maximum) && duration > maximum + 0.1) {
    throw new Error(`TikTok creator limit is ${maximum}s, but the video is ${duration.toFixed(2)}s.`);
  }

  const { size } = await fsp.stat(videoPath);
  const plan = buildTikTokChunkPlan(size);
  const caption = truncate(
    withHashtags(content.metadata.tiktokCaption, content.metadata.hashtags).replace(/\s*\n\s*/g, ' '),
    2200,
  );

  const initialized = await authenticatedTikTokRequest({
    manager,
    fetchImpl,
    url: `${TIKTOK_API}/v2/post/publish/video/init/`,
    label: 'TikTok upload initialization',
    body: JSON.stringify({
      post_info: {
        title: caption,
        privacy_level: config.tiktok.privacyLevel,
        disable_duet: config.tiktok.disableDuet,
        disable_comment: config.tiktok.disableComment,
        disable_stitch: config.tiktok.disableStitch,
        video_cover_timestamp_ms: 1000,
        brand_content_toggle: false,
        brand_organic_toggle: false,
        is_aigc: config.tiktok.aiGenerated,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: size,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
      },
    }),
  });
  const { upload_url: uploadUrl, publish_id: publishId } = initialized.data || {};
  if (!uploadUrl || !publishId) throw new Error('TikTok did not return upload_url and publish_id.');

  for (const chunk of plan.chunks) {
    const response = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${chunk.start}-${chunk.end}/${size}`,
      },
      body: fs.createReadStream(videoPath, { start: chunk.start, end: chunk.end }),
      duplex: 'half',
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) {
      throw new Error(`TikTok binary upload failed (${response.status}): ${truncate(await response.text(), 1000)}`);
    }
  }

  return {
    platform: 'tiktok',
    publishId,
    privacyLevel: config.tiktok.privacyLevel,
    status: 'PROCESSING_UPLOAD',
  };
}

function facebookBase(config) {
  return `https://graph.facebook.com/${config.facebook.graphVersion}`;
}

function facebookError(payload, label) {
  if (payload?.error) {
    throw new Error(`${label} failed: ${payload.error.message} (code ${payload.error.code || 'unknown'})`);
  }
  return payload;
}

export async function uploadFacebookReel({ videoPath, content, config, fetchImpl = fetch }) {
  assertConfigured('Facebook', {
    FACEBOOK_PAGE_ID: config.facebook.pageId,
    FACEBOOK_PAGE_ACCESS_TOKEN: config.facebook.pageAccessToken,
  });
  const endpoint = `${facebookBase(config)}/${encodeURIComponent(config.facebook.pageId)}/video_reels`;

  // Phase 1: POST /{page-id}/video_reels?upload_phase=start creates the Reel container.
  const startUrl = new URL(endpoint);
  startUrl.search = new URLSearchParams({
    access_token: config.facebook.pageAccessToken,
    upload_phase: 'start',
  });
  const startResponse = await fetchImpl(startUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  });
  const started = facebookError(
    await parseApiResponse(startResponse, 'Facebook Reel container creation'),
    'Facebook Reel container creation',
  );
  const { video_id: videoId, upload_url: returnedUploadUrl } = started;
  if (!videoId) throw new Error('Facebook did not return a video_id.');

  // Phase 2: POST raw bytes to the returned URL (equivalent to
  // https://rupload.facebook.com/video-upload/{graph-version}/{video-id}).
  const uploadUrl = returnedUploadUrl ||
    `https://rupload.facebook.com/video-upload/${config.facebook.graphVersion}/${videoId}`;
  const { size } = await fsp.stat(videoPath);
  const uploadResponse = await fetchImpl(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${config.facebook.pageAccessToken}`,
      offset: '0',
      file_size: String(size),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
    },
    body: fs.createReadStream(videoPath),
    duplex: 'half',
    signal: AbortSignal.timeout(300_000),
  });
  const uploaded = facebookError(
    await parseApiResponse(uploadResponse, 'Facebook Reel binary upload'),
    'Facebook Reel binary upload',
  );
  if (uploaded.success !== true) throw new Error('Facebook did not confirm the binary upload.');

  // Phase 3: finish the container and choose DRAFT, SCHEDULED, or PUBLISHED.
  const finishUrl = new URL(endpoint);
  finishUrl.search = new URLSearchParams({
    access_token: config.facebook.pageAccessToken,
    upload_phase: 'finish',
    video_id: videoId,
    video_state: config.facebook.videoState,
    title: content.metadata.facebookTitle,
    description: withHashtags(content.metadata.facebookDescription, content.metadata.hashtags),
  });
  const finishResponse = await fetchImpl(finishUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  });
  const finished = facebookError(
    await parseApiResponse(finishResponse, 'Facebook Reel publication'),
    'Facebook Reel publication',
  );

  return {
    platform: 'facebook',
    id: videoId,
    videoState: config.facebook.videoState,
    response: finished,
  };
}

const uploaders = {
  youtube: uploadYouTube,
  tiktok: uploadTikTok,
  facebook: uploadFacebookReel,
};

export async function publishToPlatforms({ jobDir, videoPath, content, config, platforms }) {
  const selected = platforms || config.publishing.platforms;
  const unknown = selected.filter((platform) => !uploaders[platform]);
  if (unknown.length) throw new Error(`Unknown publishing platforms: ${unknown.join(', ')}`);

  const resultPath = path.join(jobDir, 'publish-results.json');
  let previous = {};
  try {
    previous = await readJson(resultPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const pending = selected.filter((platform) => previous[platform]?.ok !== true);
  const settled = await Promise.allSettled(
    pending.map((platform) => uploaders[platform]({ videoPath, content, config })),
  );

  pending.forEach((platform, index) => {
    const outcome = settled[index];
    previous[platform] = outcome.status === 'fulfilled'
      ? { ok: true, uploadedAt: new Date().toISOString(), ...outcome.value }
      : { ok: false, attemptedAt: new Date().toISOString(), error: outcome.reason?.message || String(outcome.reason) };
  });
  await writeJson(resultPath, previous);

  const failures = Object.entries(previous).filter(([platform, result]) => selected.includes(platform) && !result.ok);
  if (failures.length) {
    const summary = failures.map(([platform, result]) => `${platform}: ${result.error}`).join('; ');
    throw new Error(`One or more uploads failed. Successful uploads were saved and will be skipped on retry. ${summary}`);
  }
  return previous;
}
