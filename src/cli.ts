/**
 * CLI interface for book extraction pipeline.
 * Usage: npm run cli -- ./path/to/cover.jpg
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { extname } from 'path';
import { runPipeline, PipelineValidationError } from './pipeline';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function formatApiError(err: any): string {
  // Anthropic SDK errors have a nested error.error.message
  if (err.error?.error?.message) return err.error.error.message;
  // Or a direct message with status
  if (err.status && err.message) {
    // Strip the raw JSON from Anthropic SDK error messages
    const match = err.message.match(/^\d+\s+/);
    if (match && err.error?.error?.message) return err.error.error.message;
  }
  return err.message || 'Unknown error';
}

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Usage: npm run cli -- <image-path>');
    process.exit(1);
  }

  if (!existsSync(imagePath)) {
    console.error(`File not found: ${imagePath}`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Set it in .env or export it.');
    process.exit(1);
  }

  const imageBase64 = readFileSync(imagePath).toString('base64');
  const ext = extname(imagePath).toLowerCase();
  const mediaType = MIME_TYPES[ext] || 'image/jpeg';

  const result = await runPipeline(imageBase64, mediaType, {
    onStep: (step, msg) => console.error(`[Step ${step}/4] ${msg}`),
    onDetail: (info) => {
      const parts = Object.entries(info).map(([k, v]) => `${k}: ${v}`);
      console.error(`         ${parts.join(', ')}`);
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  if (err instanceof PipelineValidationError) {
    console.error(`\nValidation failed: ${err.message}`);
  } else {
    console.error(`\nError: ${formatApiError(err)}`);
  }
  process.exit(1);
});
