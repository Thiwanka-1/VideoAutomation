import { z } from 'zod';

export const dialogueLineSchema = z.object({
  character: z.string().trim().min(1).max(30),
  text: z.string().trim().min(1).max(180),
});

export const contentSchema = z.object({
  concept: z.string().trim().min(10).max(300),
  hook: z.string().trim().min(3).max(120),
  visualScenePrompt: z.string().trim().min(20).max(1000),
  dialogue: z.array(dialogueLineSchema).min(8).max(20),
  metadata: z.object({
    youtubeTitle: z.string().trim().min(3).max(100),
    youtubeDescription: z.string().trim().min(20).max(3000),
    tiktokCaption: z.string().trim().min(3).max(1800),
    facebookTitle: z.string().trim().min(3).max(255),
    facebookDescription: z.string().trim().min(10).max(2000),
    hashtags: z.array(z.string().trim().min(2).max(50)).min(3).max(8),
  }),
});

export const contentJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    concept: { type: 'string', minLength: 10, maxLength: 300 },
    hook: { type: 'string', minLength: 3, maxLength: 120 },
    visualScenePrompt: { type: 'string', minLength: 20, maxLength: 1000 },
    dialogue: {
      type: 'array',
      minItems: 8,
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          character: { type: 'string', minLength: 1, maxLength: 30 },
          text: { type: 'string', minLength: 1, maxLength: 180 },
        },
        required: ['character', 'text'],
      },
    },
    metadata: {
      type: 'object',
      additionalProperties: false,
      properties: {
        youtubeTitle: { type: 'string', minLength: 3, maxLength: 100 },
        youtubeDescription: { type: 'string', minLength: 20, maxLength: 3000 },
        tiktokCaption: { type: 'string', minLength: 3, maxLength: 1800 },
        facebookTitle: { type: 'string', minLength: 3, maxLength: 255 },
        facebookDescription: { type: 'string', minLength: 10, maxLength: 2000 },
        hashtags: {
          type: 'array',
          minItems: 3,
          maxItems: 8,
          items: { type: 'string', minLength: 2, maxLength: 50 },
        },
      },
      required: [
        'youtubeTitle',
        'youtubeDescription',
        'tiktokCaption',
        'facebookTitle',
        'facebookDescription',
        'hashtags'
      ],
    },
  },
  required: ['concept', 'hook', 'visualScenePrompt', 'dialogue', 'metadata'],
};
