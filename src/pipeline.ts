import logger from './logger';
import { PipelineResult } from './types';
import { validateBookCover } from './services/bookValidation';
import { identifyBook } from './services/bookIdentification';
import { fetchBookData } from './services/bookData';
import { extractBookText } from './services/textExtraction';

export class PipelineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineValidationError';
  }
}

export async function runPipeline(imageBase64: string, mediaType: string): Promise<PipelineResult> {
  logger.info('Step 1: Validating book cover...');
  const validation = await validateBookCover(imageBase64, mediaType);
  if (!validation.isValid) {
    throw new PipelineValidationError(validation.message);
  }

  logger.info('Step 2: Identifying book...');
  const bookInfo = await identifyBook(imageBase64, mediaType);
  logger.info({ title: bookInfo.title, author: bookInfo.author, confidence: bookInfo.confidence }, 'Book identified');

  logger.info('Step 3: Fetching metadata...');
  const metadata = await fetchBookData(bookInfo.title, bookInfo.author);
  logger.info({ genre: metadata.isFiction ? 'Fiction' : 'Non-Fiction' }, 'Metadata fetched');

  logger.info('Step 4: Extracting page text...');
  const extraction = await extractBookText(bookInfo, metadata.isFiction);
  logger.info({ page: extraction.pageNumber, words: extraction.pageText.split(/\s+/).length }, 'Page extracted');

  return {
    book: {
      title: metadata.title,
      author: metadata.authors[0],
      genre: metadata.isFiction ? 'Fiction' : 'Non-Fiction',
      categories: metadata.categories.slice(0, 5),
    },
    page: {
      number: extraction.pageNumber,
      text: extraction.pageText,
    },
    debug: {
      confidence: bookInfo.confidence,
      reasoning: extraction.reasoning,
    },
  };
}
