/**
 * CLI interface for book extraction pipeline.
 * Usage: npm run cli -- ./path/to/cover.jpg
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { extname } from 'path';
import logger from './logger';
import { runPipeline } from './pipeline';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: npm run cli -- <image-path>');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Set it in .env or export it.');
    process.exit(1);
  }

  const imageBase64 = readFileSync(imagePath).toString('base64');
  const ext = extname(imagePath).toLowerCase();
  const mediaType = MIME_TYPES[ext] || 'image/jpeg';

  const result = await runPipeline(imageBase64, mediaType);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  logger.error({ err }, 'Pipeline failed');
  process.exit(1);
});
