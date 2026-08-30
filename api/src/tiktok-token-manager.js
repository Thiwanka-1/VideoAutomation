import fsp from 'node:fs/promises';
import path from 'node:path';

const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/';

function isConfigured(value) {
  return Boolean(value && !String(value).toLowerCase().includes('replace_me'));
}

function numericTimestamp(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function oauthError(payload, status) {
  const nested = payload?.error && typeof payload.error === 'object' ? payload.error : undefined;
  const code = nested?.code || (typeof payload?.error === 'string' ? payload.error : undefined) || 'token_refresh_failed';
  const message = nested?.message || payload?.error_description || payload?.message || `HTTP ${status}`;
  const error = new Error(`TikTok token refresh failed: ${code} - ${message}`);
  error.code = code;
  error.status = status;
  return error;
}

export class TikTokTokenManager {
  constructor({ config, fetchImpl = fetch, now = () => Date.now() }) {
    this.config = config.tiktok;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.loadedTokens = undefined;
    this.refreshPromise = undefined;
  }

  canRefresh() {
    return isConfigured(this.config.clientKey)
      && isConfigured(this.config.clientSecret)
      && isConfigured(this.loadedTokens?.refreshToken || this.config.refreshToken);
  }

  async load() {
    if (this.loadedTokens) return this.loadedTokens;
    let stored = {};
    if (this.config.tokenStorePath) {
      try {
        stored = JSON.parse(await fsp.readFile(this.config.tokenStorePath, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw new Error(`Could not read TikTok token store: ${error.message}`);
        }
      }
    }
    this.loadedTokens = {
      accessToken: stored.accessToken || this.config.accessToken,
      refreshToken: stored.refreshToken || this.config.refreshToken,
      accessExpiresAt: numericTimestamp(stored.accessExpiresAt || this.config.accessTokenExpiresAt),
      refreshExpiresAt: numericTimestamp(stored.refreshExpiresAt || this.config.refreshTokenExpiresAt),
      openId: stored.openId || this.config.openId,
      scope: stored.scope,
      tokenType: stored.tokenType || 'Bearer',
    };
    return this.loadedTokens;
  }

  async save(tokens) {
    if (!this.config.tokenStorePath) return;
    const directory = path.dirname(this.config.tokenStorePath);
    await fsp.mkdir(directory, { recursive: true });
    const temporaryPath = `${this.config.tokenStorePath}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(temporaryPath, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
    try {
      await fsp.rename(temporaryPath, this.config.tokenStorePath);
    } catch (error) {
      await fsp.rm(temporaryPath, { force: true });
      throw new Error(`Could not persist refreshed TikTok tokens: ${error.message}`);
    }
  }

  async getAccessToken({ forceRefresh = false } = {}) {
    const tokens = await this.load();
    const refreshSkewMs = this.config.refreshSkewSeconds * 1000;
    const expirationKnown = tokens.accessExpiresAt > 0;
    const expiresSoon = expirationKnown && tokens.accessExpiresAt <= this.now() + refreshSkewMs;

    // A seed token without an expiry is refreshed once when refresh credentials are
    // available. The returned lifetime is then stored for subsequent proactive refreshes.
    if (forceRefresh || (this.canRefresh() && (!tokens.accessToken || !expirationKnown || expiresSoon))) {
      return this.refresh();
    }
    if (!isConfigured(tokens.accessToken)) {
      throw new Error('TikTok is missing an access token or complete refresh credentials.');
    }
    return tokens.accessToken;
  }

  async refresh() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = undefined;
    }
  }

  async performRefresh() {
    const current = await this.load();
    if (!isConfigured(this.config.clientKey)
      || !isConfigured(this.config.clientSecret)
      || !isConfigured(current.refreshToken)) {
      throw new Error('TikTok token refresh requires TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REFRESH_TOKEN.');
    }
    if (current.refreshExpiresAt && current.refreshExpiresAt <= this.now()) {
      throw new Error('TikTok refresh token has expired. Re-authorize the TikTok account.');
    }

    const body = new URLSearchParams({
      client_key: this.config.clientKey,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
    });
    const response = await this.fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache',
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await readResponse(response);
    if (!response.ok || payload.error) throw oauthError(payload, response.status);
    if (!isConfigured(payload.access_token) || !isConfigured(payload.refresh_token || current.refreshToken)) {
      throw new Error('TikTok token refresh returned an incomplete token bundle.');
    }

    const now = this.now();
    const refreshed = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token || current.refreshToken,
      accessExpiresAt: now + Number(payload.expires_in || 0) * 1000,
      refreshExpiresAt: now + Number(payload.refresh_expires_in || 0) * 1000,
      openId: payload.open_id || current.openId,
      scope: payload.scope || current.scope,
      tokenType: payload.token_type || 'Bearer',
      updatedAt: new Date(now).toISOString(),
    };
    await this.save(refreshed);
    this.loadedTokens = refreshed;
    return refreshed.accessToken;
  }
}

export function isTikTokAccessTokenError(error) {
  return error?.code === 'access_token_invalid'
    || (error?.status === 401 && error?.code !== 'scope_not_authorized');
}

export async function withTikTokAuthRetry(manager, operation) {
  const accessToken = await manager.getAccessToken();
  try {
    return await operation(accessToken);
  } catch (error) {
    if (!isTikTokAccessTokenError(error) || !manager.canRefresh()) throw error;
    const refreshedAccessToken = await manager.getAccessToken({ forceRefresh: true });
    return operation(refreshedAccessToken);
  }
}
