import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSkit } from '../src/generator.js';

test('sends Ollama a JSON schema and validates the structured response', async () => {
  let request;
  const generated = {
    concept: 'Two developers misunderstand a production incident in a comic escalation.',
    hook: 'Why is production emailing us?',
    visualScenePrompt: 'An original vertical office scene with two fictional engineers and open subtitle space, no logos.',
    dialogue: Array.from({ length: 8 }, (_, index) => ({
      character: index % 2 ? 'Lin' : 'Ada',
      text: `Original test dialogue line number ${index + 1}.`,
    })),
    metadata: {
      youtubeTitle: 'Production Sent an Email',
      youtubeDescription: 'An original workplace comedy about a very confusing production incident.',
      tiktokCaption: 'When production becomes a coworker.',
      facebookTitle: 'Production Sent an Email',
      facebookDescription: 'A workplace skit about debugging the messenger.',
      hashtags: ['Comedy', '#DeveloperComedy', 'Workplace Humor'],
    },
  };
  const fetchImpl = async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return Response.json({ message: { content: JSON.stringify(generated) } });
  };

  const result = await generateSkit({
    topic: 'production incidents',
    config: {
      channel: { brand: 'Test Channel', niche: 'developer comedy', language: 'English' },
      video: { targetDurationSeconds: 60 },
      ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'test-model' },
    },
    fetchImpl,
  });

  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(request.body.stream, false);
  assert.equal(request.body.format.type, 'object');
  assert.ok(request.body.format.required.includes('dialogue'));
  assert.deepEqual(result.metadata.hashtags, ['#Comedy', '#DeveloperComedy', '#WorkplaceHumor']);
});
