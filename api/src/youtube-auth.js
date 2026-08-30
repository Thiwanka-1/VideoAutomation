import { google } from 'googleapis';
import { assertConfigured } from './config.js';

export async function youtubeAuth({ code, config }) {
  assertConfigured('YouTube OAuth', {
    YOUTUBE_CLIENT_ID: config.youtube.clientId,
    YOUTUBE_CLIENT_SECRET: config.youtube.clientSecret,
  });
  const oauth = new google.auth.OAuth2(
    config.youtube.clientId,
    config.youtube.clientSecret,
    config.youtube.redirectUri,
  );
  if (!code) {
    return {
      authorizationUrl: oauth.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/youtube.upload'],
      }),
    };
  }
  const { tokens } = await oauth.getToken(code);
  return { refreshToken: tokens.refresh_token, note: 'Copy this value into YOUTUBE_REFRESH_TOKEN in .env.' };
}
