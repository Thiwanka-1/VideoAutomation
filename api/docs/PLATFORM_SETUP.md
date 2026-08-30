# Channel, API, and monetization setup

Checked against official platform material on 2026-08-30. Platform programs and API versions change; recheck the linked pages before enabling unattended public uploads.

## Recommended channel direction

The strongest starting concept for a software engineer is **Runtime Roommates**: recurring fictional coworkers encountering bugs, meetings, AI misunderstandings, and workplace absurdity. It gives the channel a recognizable identity while allowing every episode to have a materially different story.

Other name ideas (availability and trademarks have not been checked):

- Deadpan Debug
- One-Minute Glitches
- Tiny Twist Theatre
- Plot in Portrait
- Office NPC
- Loop & Punch
- Byte-Sized Plot
- Merge Conflict Comedy

Use the same handle, profile image, short bio, and color palette on all three platforms when available. A useful bio is: “Original one-minute workplace skits about humans, bugs, and the code between them.” Do not put a watermark from one platform on uploads to another.

## Content settings that support monetization

- Treat Ollama as a writing assistant, not a bulk-content loophole. Review every script and video.
- Build a small “story bible”: 2-3 named recurring characters, distinct personalities, visual traits, and a consistent world.
- Make the substance and payoff different in every episode. Rotate formats and settings, not just nouns in a template.
- Use only visuals, voices, music, fonts, and effects you own or can commercially monetize. This project adds no music.
- Enable synthetic/AI disclosure when the scene looks realistic. The code sends YouTube's `containsSyntheticMedia` and TikTok's `is_aigc` fields.
- Never use engagement bots, bought views, copied clips, misleading metadata, or irrelevant trending hashtags.
- Keep a human approval step. Save scripts and source assets as evidence of your creation process.

YouTube explicitly says original AI-assisted narratives can monetize, while generic, repetitive, mass-produced templates and low-value slideshows may not. Read the [YouTube channel monetization policies](https://support.google.com/youtube/answer/1311392) and [Shorts monetization policies](https://support.google.com/youtube/answer/12504220).

## YouTube Shorts

### Channel settings

1. Create the channel and turn on Google Account 2-Step Verification.
2. In YouTube Studio, complete phone/identity verification for Advanced features.
3. Set the channel audience honestly. These workplace skits should normally be “not made for kids,” but the actual content controls the answer.
4. Set upload defaults to **Private** during API testing, category **Comedy** (23), language, and a reusable one-line channel description. Do not make descriptions identical beyond a short brand footer.
5. In Studio > Earn, link one AdSense for YouTube account when eligible and accept the Shorts Monetization Module.

For Shorts ad revenue, the general threshold is 1,000 subscribers plus either 4,000 qualifying long-form watch hours in 12 months or 10 million qualifying public Shorts views in 90 days. Shorts-feed watch time does not count toward the 4,000-hour path. Eligibility also requires a supported region, no active strikes, Advanced features, 2FA, policy compliance, and channel review. See the [official YPP eligibility page](https://support.google.com/youtube/answer/72851) and [YPP region availability](https://support.google.com/youtube/answer/7101720).

### API setup

1. In Google Cloud Console, create a project and enable **YouTube Data API v3**.
2. Configure the OAuth consent screen, then create a Desktop/Web OAuth client.
3. Put the client ID and secret in `.env`.
4. Run `node src/cli.js youtube-auth`, open the returned URL, consent using the channel owner, and copy the `code` query parameter from the redirect URL.
5. Run `node src/cli.js youtube-auth --code "THE_CODE"`, then put the returned refresh token in `YOUTUBE_REFRESH_TOKEN`.

The uploader calls [`videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert). New unverified API projects are restricted to private uploads until they pass an audit. The upload scope is `https://www.googleapis.com/auth/youtube.upload`.

## TikTok

### Account and monetization settings

1. Use a real **Personal Account** in good standing. Business Accounts are not eligible for Creator Rewards.
2. Set accurate birthday and region details; do not use a VPN or false country information to bypass availability.
3. In TikTok Studio > Monetization, check whether Creator Rewards is offered for your account/region.
4. Reward-eligible videos must be original, high quality, at least one minute long, uploaded after joining, and eventually receive qualifying views. The commonly documented account thresholds are age 18+ (19 in South Korea), 10,000 followers, and 100,000 video views in the prior 30 days. Verify in the [official Creator Rewards help area](https://support.tiktok.com/en/business-and-creator/creator-rewards-program/creator-rewards-program).

### API setup

1. Register an app in [TikTok for Developers](https://developers.tiktok.com/), add the Content Posting API product, and enable Direct Post.
2. Request approval for `video.publish`. The target account must authorize that scope.
3. Put the user access token in `TIKTOK_ACCESS_TOKEN` and refresh it using your OAuth backend before expiry.
4. Keep `TIKTOK_PRIVACY_LEVEL=SELF_ONLY` while unaudited; posts from unaudited Direct Post clients are private.
5. Submit the app for audit before changing to a public privacy level.

The implementation follows TikTok's required creator query, [`POST /v2/post/publish/video/init/`](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), chunked `PUT` to the returned upload URL, and [`POST /v2/post/publish/status/fetch/`](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status). It also obeys the official [5-64 MB chunk guidance](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide).

### TikTok token rotation

Configure `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_ACCESS_TOKEN`, and
`TIKTOK_REFRESH_TOKEN` in `api/.env`. The first publish refreshes a seed access
token whose expiry is unknown. Thereafter, the backend refreshes 15 minutes before
expiry and also retries once when TikTok returns `access_token_invalid`.

TikTok may rotate the refresh token. The complete returned token bundle is written
to `api/data/tiktok-tokens.json`, which is ignored by Git and takes precedence over
the seed values in `.env`. Do not manually copy every rotation back into `.env`.
Delete the token-store file only when intentionally replacing the account/token
bundle. For a hosted deployment, replace this local file store with encrypted
database or secret-manager storage.

## Facebook Reels

### Page and monetization settings

1. Create a Facebook **Page** with a complete category, bio, profile image, cover, and Page username. The API does not publish this Reel flow to a personal profile.
2. Secure every administrator account with 2FA and keep Page roles minimal.
3. Open Professional Dashboard > Monetization > Content Monetization and submit the interest form if shown. As of the check date, [Facebook Content Monetization is invite-only](https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/).
4. Follow Meta's originality guidance: direct creation is prioritized, while duplicative material and minor edits to someone else's content are deprioritized. See [Meta's original creator guidance](https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/).

### API setup

1. Create a Meta developer app and connect the Page.
2. Obtain review/advanced access as needed for `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`.
3. Exchange the authorized user token for a **Page Access Token** and put that token—not the app secret—in `FACEBOOK_PAGE_ACCESS_TOKEN`.
4. Put the numeric Page ID in `FACEBOOK_PAGE_ID`.
5. Keep `FACEBOOK_VIDEO_STATE=DRAFT` until uploads have been reviewed successfully. Set it to `PUBLISHED` only after app permissions and output quality are verified.

The official Meta Postman collection documents the exact [Facebook Reels publishing flow](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api):

```text
POST https://graph.facebook.com/{version}/{page-id}/video_reels
  ?upload_phase=start&access_token={page-access-token}

POST https://rupload.facebook.com/video-upload/{version}/{video-id}
Authorization: OAuth {page-access-token}
offset: 0
file_size: {number-of-bytes}
Content-Type: application/octet-stream
Body: raw MP4 bytes

POST https://graph.facebook.com/{version}/{page-id}/video_reels
  ?upload_phase=finish
  &video_id={video-id}
  &video_state=DRAFT|SCHEDULED|PUBLISHED
  &title=...
  &description=...
  &access_token={page-access-token}
```

Meta versions expire. Keep `FACEBOOK_GRAPH_VERSION` configurable and test the next version before the current one reaches end of life.

## A realistic zero-budget launch sequence

1. Produce 10-15 private videos, refine the recurring characters, subtitle styling, voice cadence, and hooks.
2. Publish 3-5 strong episodes per week rather than flooding interchangeable daily output.
3. Compare retention, rewatches, shares, and comments by concept—not only raw views.
4. Rewrite weak concepts and add more scene changes before increasing volume.
5. Only enable unattended posting after the APIs are audited and at least 30 reviewed runs have behaved correctly.

No application can promise earnings. Platform acceptance, country availability, originality review, audience response, taxes, and payout setup all remain external requirements.
