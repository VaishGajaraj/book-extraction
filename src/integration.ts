/**
 * Integration tests - runs the full pipeline against real images.
 * Usage: npm run integration
 *
 * Requires ANTHROPIC_API_KEY set in .env
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { extname, join } from 'path';
import { runPipeline } from './pipeline';

const IMAGES_DIR = join(__dirname, '..', 'images');

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

interface TestResult {
  file: string;
  passed: boolean;
  duration: number;
  result?: any;
  error?: string;
}

async function runTest(imagePath: string, fileName: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const imageBase64 = readFileSync(imagePath).toString('base64');
    const ext = extname(imagePath).toLowerCase();
    const mediaType = MIME_TYPES[ext] || 'image/jpeg';

    const result = await runPipeline(imageBase64, mediaType);
    const duration = Date.now() - start;

    // Validate result structure
    const checks: string[] = [];
    if (!result.book.title) checks.push('missing book title');
    if (!result.book.author) checks.push('missing book author');
    if (!result.book.genre) checks.push('missing genre');
    if (!result.page.text) checks.push('missing page text');
    if (result.page.text.split(/\s+/).length < 50) checks.push('page text too short');
    if (!result.debug.confidence) checks.push('missing confidence');
    if (!result.debug.reasoning) checks.push('missing reasoning');

    // Fiction-specific checks
    if (fileName.includes('fiction') && !fileName.includes('nonfiction')) {
      if (result.book.genre !== 'Fiction') checks.push(`expected Fiction genre, got ${result.book.genre}`);
      if (result.page.number !== 2) checks.push(`expected page 2, got ${result.page.number}`);
    }

    // Non-fiction-specific checks
    if (fileName.includes('nonfiction')) {
      if (result.book.genre !== 'Non-Fiction') checks.push(`expected Non-Fiction genre, got ${result.book.genre}`);
      if (result.page.number !== 1) checks.push(`expected page 1, got ${result.page.number}`);
    }

    if (checks.length > 0) {
      return { file: fileName, passed: false, duration, result, error: checks.join('; ') };
    }

    return { file: fileName, passed: true, duration, result };
  } catch (err: any) {
    return { file: fileName, passed: false, duration: Date.now() - start, error: err.message };
  }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Set it in .env or export it.');
    process.exit(1);
  }

  const files = readdirSync(IMAGES_DIR).filter(f =>
    ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extname(f).toLowerCase())
  );

  if (files.length === 0) {
    console.error('No images found in images/ directory');
    process.exit(1);
  }

  console.log(`\nRunning integration tests on ${files.length} image(s)...\n`);

  const results: TestResult[] = [];

  for (const file of files) {
    console.log(`Testing: ${file}...`);
    const result = await runTest(join(IMAGES_DIR, file), file);
    results.push(result);

    if (result.passed) {
      console.log(`  ✓ ${file} (${(result.duration / 1000).toFixed(1)}s)`);
      console.log(`    Book: "${result.result.book.title}" by ${result.result.book.author}`);
      console.log(`    Genre: ${result.result.book.genre} | Page: ${result.result.page.number}`);
      console.log(`    Text: ${result.result.page.text.substring(0, 100)}...`);
      console.log(`    Confidence: ${result.result.debug.confidence}`);
    } else {
      console.log(`  ✗ ${file} (${(result.duration / 1000).toFixed(1)}s)`);
      console.log(`    Error: ${result.error}`);
      if (result.result) {
        console.log(`    Got: "${result.result.book.title}" by ${result.result.book.author} (${result.result.book.genre})`);
      }
    }
    console.log();
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`━━━ Integration: ${passed} passed, ${failed} failed ━━━`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.file}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
