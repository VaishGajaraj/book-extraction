import axios from 'axios';
import { BookMetadata } from '../types';
import { anthropic } from '../anthropic';
import { extractTextContent } from '../helpers';

/**
 * Parses a Google Books API response into BookMetadata.
 * Extracted as a pure function for testability.
 */
export function parseGoogleBooksResponse(
  data: any,
  fallbackTitle: string,
  fallbackAuthor: string
): { title: string; authors: string[]; categories: string[] } {
  if (!data.items?.length) {
    return {
      title: fallbackTitle,
      authors: [fallbackAuthor],
      categories: [],
    };
  }

  const vol = data.items[0].volumeInfo;
  return {
    title: vol.title || fallbackTitle,
    authors: vol.authors || [fallbackAuthor],
    categories: vol.categories || [],
  };
}

/**
 * Uses Claude Haiku to classify fiction vs non-fiction.
 * Handles all genres including horror, drama, satire, literary fiction, etc.
 * Falls back gracefully when no categories are available.
 */
async function classifyWithAI(
  title: string,
  author: string,
  categories: string[]
): Promise<boolean> {
  const categoryInfo = categories.length > 0
    ? `Categories: ${categories.join(', ')}`
    : 'No categories available';

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    messages: [{
      role: 'user',
      content: `Is this book fiction or non-fiction?

Title: "${title}"
Author: ${author}
${categoryInfo}

Reply with exactly one word: FICTION or NONFICTION`,
    }],
  });

  const answer = extractTextContent(response).trim().toUpperCase();
  return answer.includes('FICTION') && !answer.includes('NONFICTION');
}

/**
 * Fetches book metadata from Google Books API and classifies fiction/non-fiction
 * using Claude Haiku.
 *
 * Why Google Books:
 * - Free, no API key required
 * - Explicit categories array for genre classification
 * - Good coverage of modern and classic titles
 *
 * Why Claude Haiku for classification:
 * - Handles all genres (horror, drama, satire, literary fiction, etc.)
 * - ~$0.0002/call, <1s latency
 * - Falls back gracefully when categories are missing (Haiku knows most books)
 */
export async function fetchBookData(title: string, author: string): Promise<BookMetadata> {
  const searchUrl = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}+inauthor:${encodeURIComponent(author)}&printType=books`;

  let parsed: { title: string; authors: string[]; categories: string[] };

  try {
    const response = await axios.get(searchUrl, { timeout: 10000 });
    parsed = parseGoogleBooksResponse(response.data, title, author);
  } catch {
    // If Google Books is unreachable, use fallback values
    parsed = { title, authors: [author], categories: [] };
  }

  const isFiction = await classifyWithAI(parsed.title, parsed.authors[0], parsed.categories);

  return {
    title: parsed.title,
    authors: parsed.authors,
    categories: parsed.categories,
    isFiction,
  };
}
