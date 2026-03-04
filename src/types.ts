export interface BookInfo {
  title: string;
  author: string;
  isbn: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface BookMetadata {
  title: string;
  authors: string[];
  categories: string[];
  isFiction: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  message: string;
}

export interface PageExtraction {
  pageText: string;
  pageNumber: number;
  reasoning: string;
}

export interface PipelineResult {
  book: {
    title: string;
    author: string;
    genre: string;
    categories: string[];
  };
  page: {
    number: number;
    text: string;
  };
  debug: {
    confidence: string;
    reasoning: string;
  };
}
