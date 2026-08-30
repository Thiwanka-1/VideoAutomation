# Vertical Skit Studio

A local-first full-stack application for creating, reviewing, and publishing original 9:16 video skits.

- `api/` — Node.js generation pipeline, Express REST API, CLI, scheduler, FFmpeg editor, and platform publishers
- `client/` — React/Vite production dashboard

The dashboard lets you submit an episode idea, follow every pipeline stage, preview the finished video, review the generated dialogue/descriptions/hashtags, copy metadata, choose publishing platforms, and provide explicit human approval.

## Setup

Requirements: Node.js 20+, [Ollama](https://ollama.com/download), and a Hugging Face token.

From the project root:

```powershell
npm run setup
ollama pull qwen2.5:7b
Copy-Item .\api\.env.example .\api\.env
```

Add `HF_TOKEN` to `api/.env`. Platform tokens can remain unset while you test video generation.

## Development

Start the API and Vite frontend together:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` and `/media` to the backend at `http://127.0.0.1:4000`.

If the dashboard reports Ollama as offline, start the Ollama application/service and refresh the page. The Create button stays locked until both Ollama and Hugging Face are configured.

## Production-style local run

Build the client, then let Express serve both the API and frontend:

```powershell
npm run build
npm start
```

Open `http://127.0.0.1:4000`.

## Browser workflow

1. Enter an episode topic or let Ollama invent one.
2. Watch the job progress through script, visual, voice, captions, and render stages.
3. Play the complete 60-second vertical video.
4. Review the dialogue, hook, descriptions, captions, and hashtags.
5. Choose YouTube, TikTok, and/or Facebook.
6. Check the human-review confirmation and start publishing.

`DRY_RUN=true`, private/draft platform settings, and `REQUIRE_APPROVAL=true` remain the defaults. The frontend cannot bypass these backend controls. Job state and artifacts persist under `api/output/`, and successful platform uploads are skipped on retry.

## Useful commands

```powershell
npm test                         # API tests plus frontend production build
npm run check                    # Import every backend module
npm --prefix api run generate -- --topic "Friday deploy"
npm --prefix api run schedule
```

API-specific architecture, Facebook upload endpoints, CLI usage, and operational limits are in [api/README.md](api/README.md). OAuth, Page token, channel, and monetization setup are in [api/docs/PLATFORM_SETUP.md](api/docs/PLATFORM_SETUP.md).

## REST endpoints

- `GET /api/health` — API and Ollama worker status
- `GET /api/config` — safe, redacted integration and publishing configuration
- `GET /api/jobs` — persisted episode summaries
- `GET /api/jobs/:id` — content, status, platform results, and artifact URLs
- `POST /api/jobs` — start generation with `{ "topic": "..." }`
- `POST /api/jobs/:id/publish` — start reviewed publishing with `{ "platforms": [...], "approved": true }`
- `GET /api/docs/setup` — platform setup guide
- `/media/:jobId/*` — generated video and review assets

This application automates production work; it does not guarantee platform acceptance, audience growth, or monetization. Human creative review remains part of the design because repetitive mass-generated content is a monetization risk.
