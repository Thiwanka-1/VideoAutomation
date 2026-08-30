import fs from 'node:fs/promises';
import { InferenceClient } from '@huggingface/inference';
import { assertConfigured } from './config.js';

export async function generateBackground({ prompt, outputPath, config, client }) {
  assertConfigured('Hugging Face', { HF_TOKEN: config.huggingFace.token });

  const hf = client || new InferenceClient(config.huggingFace.token);
  const image = await hf.textToImage({
    provider: config.huggingFace.provider,
    model: config.huggingFace.model,
    inputs: `${prompt}. Cinematic vertical composition, expressive original fictional characters, high detail. No words, captions, signs, logos, or watermark.`,
    parameters: {
      width: config.huggingFace.width,
      height: config.huggingFace.height,
      negative_prompt: 'text, letters, logo, watermark, signature, low quality, blurry, duplicate people',
    },
  });

  const bytes = image instanceof Blob
    ? Buffer.from(await image.arrayBuffer())
    : Buffer.from(image);
  await fs.writeFile(outputPath, bytes);
  return outputPath;
}
