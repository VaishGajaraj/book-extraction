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

export interface PipelineCallbacks {
  onStep?: (step: number, message: string) => void;
  onDetail?: (detail: Record<string, any>) => void;
}

export async function runPipeline(
  imageBase64: string,
  mediaType: string,
  callbacks?: PipelineCallbacks
): Promise<PipelineResult> {
  const log = callbacks?.onStep ?? (() => {});
  const detail = callbacks?.onDetail ?? (() => {});

  log(1, 'Validating book cover...');
  const validation = await validateBookCover(imageBase64, mediaType);
  if (!validation.isValid) {
    throw new PipelineValidationError(validation.message);
  }

  log(2, 'Identifying book...');
  const bookInfo = await identifyBook(imageBase64, mediaType);
  detail({ title: bookInfo.title, author: bookInfo.author, confidence: bookInfo.confidence });

  log(3, 'Fetching metadata...');
  const metadata = await fetchBookData(bookInfo.title, bookInfo.author);
  detail({ genre: metadata.isFiction ? 'Fiction' : 'Non-Fiction' });

  log(4, 'Extracting page text...');
  const extraction = await extractBookText(bookInfo, metadata.isFiction);
  detail({ page: extraction.pageNumber, words: extraction.pageText.split(/\s+/).length });

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
