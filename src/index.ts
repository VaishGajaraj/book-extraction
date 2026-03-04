import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import logger from './logger';
import { runPipeline, PipelineValidationError } from './pipeline';

const app = express();

// Multer configuration - in-memory storage, 5MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only images allowed'));
      return;
    }
    cb(null, true);
  }
});

// Serve static frontend
app.use(express.static('public'));

/**
 * Main extraction endpoint - orchestrates the entire AI pipeline.
 *
 * Flow:
 * 1. Validate book cover (Claude Vision)
 * 2. Identify book metadata (Claude Vision with structured output)
 * 3. Fetch book data (Google Books API + Claude Haiku classification)
 * 4. Extract specific page (Claude Text with chain-of-thought)
 */
app.post('/api/extract', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const imageBase64 = req.file.buffer.toString('base64');
    const result = await runPipeline(imageBase64, req.file.mimetype, {
      onStep: (step, msg) => logger.info(`Step ${step}: ${msg}`),
      onDetail: (info) => logger.info(info),
    });
    return res.json(result);

  } catch (error: any) {
    if (error instanceof PipelineValidationError) {
      return res.status(400).json({
        error: 'Invalid book cover',
        message: error.message,
      });
    }
    logger.error({ err: error }, 'Extraction failed');
    return res.status(500).json({
      error: 'Extraction failed',
      message: error.message || 'Please try another book'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Book Extraction AI running');

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not set');
  }
});
