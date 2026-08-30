import cron from 'node-cron';
import { runPipeline } from './pipeline.js';

export function startScheduler(config) {
  if (!cron.validate(config.schedule.cron)) {
    throw new Error(`Invalid SCHEDULE_CRON expression: ${config.schedule.cron}`);
  }
  let running = false;
  let topicIndex = 0;

  const task = cron.schedule(config.schedule.cron, async () => {
    if (running) {
      console.warn('[scheduler] Previous pipeline is still running; skipping this occurrence.');
      return;
    }
    running = true;
    const configuredTopics = config.schedule.topics;
    const topic = configuredTopics.length ? configuredTopics[topicIndex % configuredTopics.length] : undefined;
    topicIndex += 1;
    try {
      const result = await runPipeline({
        topic,
        publish: config.schedule.publish,
        approved: !config.publishing.requireApproval,
        config,
      });
      console.log(`[scheduler] Completed job: ${result.jobDir}`);
    } catch (error) {
      console.error(`[scheduler] Job failed: ${error.message}`);
    } finally {
      running = false;
    }
  }, { timezone: config.schedule.timezone });

  console.log(`[scheduler] Active: ${config.schedule.cron} (${config.schedule.timezone})`);
  console.log(`[scheduler] Automatic publishing: ${config.schedule.publish ? 'enabled' : 'disabled'}`);
  return task;
}
