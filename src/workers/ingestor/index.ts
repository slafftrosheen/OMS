// Knowledge ingestion worker.
//
// Runs as a long-lived process (k3s deployment / pm2 / systemd). Polls
// `knowledge_sources` for new uploads and runs the multi-stage pipeline.
// Quiet polling cadence comes from JOB_QUEUE_TICK_MS in .env.
//
// Usage:
//   tsx src/workers/ingestor/index.ts
// or via npm script:
//   npm run ingestor

import 'dotenv/config';
import { tickIngestor } from '$lib/server/ai/ingest/pipeline';
import { startSwarmHealthLoop } from '$lib/server/ai/swarm';
import { logger } from '$lib/server/logging/logger';
import { AILAB } from '$lib/server/config';

let stopping = false;

function handleSignal(sig: NodeJS.Signals) {
    logger.info(`ingestor: received ${sig}, shutting down`);
    stopping = true;
}
process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);

async function main() {
    logger.info('ingestor: starting', { tick_ms: AILAB.queue_tickMs });
    startSwarmHealthLoop();

    while (!stopping) {
        let processed = false;
        try {
            processed = await tickIngestor();
        } catch (err) {
            logger.error('ingestor: tick error', err as Error);
        }
        if (!processed) {
            await new Promise((r) => setTimeout(r, AILAB.queue_tickMs));
        }
    }
    logger.info('ingestor: stopped');
}

main().catch((err) => {
    logger.error('ingestor: fatal', err as Error);
    process.exit(1);
});
