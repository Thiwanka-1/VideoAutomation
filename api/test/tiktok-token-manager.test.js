import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TikTokTokenManager, withTikTokAuthRetry } from '../src/tiktok-token-manager.js';

test('refreshes an expiring TikTok token and persists the rotated bundle', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vertical-skit-tiktok-'));
  const tokenStorePath = path.join(directory, 'tokens.json');
  const now = Date.parse('2026-08-30T12:00:00.000Z');
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      access_token: 'new-access-token',
      expires_in: 86_400,
      refresh_token: 'new-refresh-token',
      refresh_expires_in: 31_536_000,
      open_id: 'user-open-id',
      scope: 'video.publish',
      token_type: 'Bearer',
    });
  };
  const manager = new TikTokTokenManager({
    config: {
      tiktok: {
        clientKey: 'client-key',
        clientSecret: 'client-secret',
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        accessTokenExpiresAt: new Date(now + 60_000).toISOString(),
        tokenStorePath,
        refreshSkewSeconds: 900,
      },
    },
    fetchImpl,
    now: () => now,
  });

  try {
    assert.equal(await manager.getAccessToken(), 'new-access-token');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://open.tiktokapis.com/v2/oauth/token/');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.equal(calls[0].options.body.get('grant_type'), 'refresh_token');
    assert.equal(calls[0].options.body.get('refresh_token'), 'old-refresh-token');

    const stored = JSON.parse(await fs.readFile(tokenStorePath, 'utf8'));
    assert.equal(stored.accessToken, 'new-access-token');
    assert.equal(stored.refreshToken, 'new-refresh-token');
    assert.equal(stored.accessExpiresAt, now + 86_400_000);
    assert.equal(stored.refreshExpiresAt, now + 31_536_000_000);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('retries an authenticated TikTok operation once after access_token_invalid', async () => {
  const requestedTokens = [];
  const manager = {
    canRefresh: () => true,
    getAccessToken: async ({ forceRefresh = false } = {}) => forceRefresh ? 'refreshed-token' : 'expired-token',
  };

  const result = await withTikTokAuthRetry(manager, async (token) => {
    requestedTokens.push(token);
    if (token === 'expired-token') {
      const error = new Error('expired');
      error.status = 401;
      error.code = 'access_token_invalid';
      throw error;
    }
    return 'published';
  });

  assert.equal(result, 'published');
  assert.deepEqual(requestedTokens, ['expired-token', 'refreshed-token']);
});

test('does not refresh when TikTok reports a missing scope', async () => {
  let refreshRequested = false;
  const manager = {
    canRefresh: () => true,
    getAccessToken: async ({ forceRefresh = false } = {}) => {
      refreshRequested ||= forceRefresh;
      return 'access-token';
    },
  };
  const error = new Error('missing scope');
  error.status = 401;
  error.code = 'scope_not_authorized';

  await assert.rejects(
    withTikTokAuthRetry(manager, async () => { throw error; }),
    /missing scope/,
  );
  assert.equal(refreshRequested, false);
});
