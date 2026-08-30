#!/usr/bin/env node
import path from 'node:path';
import { Command } from 'commander';
import { config } from './config.js';
import { publishJob, runPipeline } from './pipeline.js';
import { startScheduler } from './scheduler.js';
import { youtubeAuth } from './youtube-auth.js';

const program = new Command();
program
  .name('vertical-skits')
  .description('Generate, render, review, and publish original vertical skits.')
  .version('1.0.0');

program.command('run')
  .description('Generate and render a new video.')
  .option('-t, --topic <topic>', 'Episode topic; Ollama invents one when omitted')
  .option('--publish', 'Publish after rendering (still respects DRY_RUN and approval locks)', false)
  .option('--approve', 'Confirm that a human reviewed the generated video', false)
  .option('--platforms <list>', 'Comma-separated subset: youtube,tiktok,facebook')
  .action(async (options) => {
    const platforms = options.platforms?.split(',').map((item) => item.trim()).filter(Boolean);
    const result = await runPipeline({
      topic: options.topic,
      publish: options.publish,
      approved: options.approve,
      config,
      platforms,
    });
    console.log(`\nJob ready: ${result.jobDir}`);
    if (!options.publish) console.log('Review video.mp4, then use the publish command when ready.');
    if (result.publishResults?.skipped) console.log(result.publishResults.reason);
  });

program.command('publish')
  .description('Publish an existing rendered job without regenerating it.')
  .requiredOption('-j, --job <directory>', 'Job directory under output/')
  .option('--approve', 'Confirm that a human reviewed the generated video', false)
  .option('--platforms <list>', 'Comma-separated subset: youtube,tiktok,facebook')
  .action(async (options) => {
    const platforms = options.platforms?.split(',').map((item) => item.trim()).filter(Boolean);
    const result = await publishJob({
      jobDir: path.resolve(options.job),
      approved: options.approve,
      platforms,
      config,
    });
    console.log(JSON.stringify(result, null, 2));
  });

program.command('schedule')
  .description('Run the configured recurring generation schedule.')
  .action(() => startScheduler(config));

program.command('youtube-auth')
  .description('Create the one-time YouTube OAuth URL or exchange its authorization code.')
  .option('--code <code>', 'Authorization code returned to the redirect URL')
  .action(async (options) => {
    console.log(JSON.stringify(await youtubeAuth({ code: options.code, config }), null, 2));
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(`Error: ${error.message}`);
  if (process.env.DEBUG === 'true') console.error(error.stack);
  process.exitCode = 1;
}
