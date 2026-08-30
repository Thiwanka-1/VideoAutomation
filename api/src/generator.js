import { contentJsonSchema, contentSchema } from './content-schema.js';

function normalizeHashtags(items) {
  return [...new Set(items.map((tag) => {
    const compact = tag.trim().replace(/^#+/, '').replace(/\s+/g, '');
    return `#${compact}`;
  }))];
}

export async function generateSkit({ topic, config, fetchImpl = fetch }) {
  const topicInstruction = topic
    ? `The episode topic is: ${topic}`
    : 'Invent a timely-feeling evergreen episode topic. Do not rely on current news.';

  const system = [
    `You are the head writer for ${config.channel.brand}, a channel about ${config.channel.niche}.`,
    'Write an original, coherent vertical-video comedy skit with a hook, escalation, and payoff.',
    `Write in ${config.channel.language}. Aim for 135-155 spoken words so TTS plus pauses lasts about ${config.video.targetDurationSeconds} seconds.`,
    'Use two or three recurring fictional characters. Every dialogue line must be 180 characters or fewer.',
    'Do not imitate living creators, copyrighted characters, brand slogans, or existing scripts.',
    'Avoid hate, sexual content, dangerous acts, medical/financial claims, profanity, and deceptive current-event claims.',
    'The image prompt must describe one original 9:16 scene, leave the bottom and center readable for subtitles, and request no text, logos, or watermarks.',
    'Metadata must accurately describe this exact episode. Use 3-8 relevant hashtags; never keyword-stuff or use misleading trends.',
    'Return only JSON matching the supplied schema.',
  ].join(' ');

  const response = await fetchImpl(`${config.ollama.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollama.model,
      stream: false,
      format: contentJsonSchema,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `${topicInstruction}\nJSON schema:\n${JSON.stringify(contentJsonSchema)}`,
        },
      ],
      options: { temperature: 0.8, top_p: 0.9 },
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const payload = await response.json();
  const raw = payload?.message?.content;
  if (!raw) throw new Error('Ollama returned no message content.');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Ollama returned invalid JSON: ${error.message}`);
  }

  const content = contentSchema.parse(parsed);
  content.metadata.hashtags = normalizeHashtags(content.metadata.hashtags);
  return content;
}
