import axios from 'axios';
import { BookInfo, PageExtraction } from '../types';
import { anthropic } from '../anthropic';
import { extractTextContent } from '../helpers';

/**
 * Extracts specific page text from a book using Internet Archive + Claude AI.
 *
 * AI Engineering Showcase:
 * - Chain-of-thought prompting for complex reasoning
 * - Context-aware instructions (fiction vs non-fiction)
 * - Structured multi-section output (REASONING + PAGE_TEXT)
 * - Multi-step orchestration (fetch → analyze → extract → validate)
 */
export async function extractBookText(
  bookInfo: BookInfo,
  isFiction: boolean
): Promise<PageExtraction> {

  // Step 1: Get full text from Internet Archive
  const bookText = await fetchBookFromArchive(bookInfo);

  // Step 2: Use Claude with chain-of-thought to find the right page
  const targetPageNumber = isFiction ? 2 : 1;
  const contentType = isFiction ? 'Fiction' : 'Non-Fiction';

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `You are a book content analyzer. Your task is to extract a specific page from this ${contentType} book.

BOOK: "${bookInfo.title}" by ${bookInfo.author}
GENRE: ${contentType}
TARGET: Content page ${targetPageNumber} (${targetPageNumber === 1 ? 'FIRST' : 'SECOND'} page of actual content)

THINK STEP-BY-STEP:
1. Identify the front matter (title page, copyright, dedication, epigraph, foreword, preface, prologue, table of contents)
2. Find where the main content begins (Chapter 1, Part I, Introduction, etc.)
3. ${targetPageNumber === 1
    ? 'Extract the FIRST page of that main content'
    : 'Extract the SECOND page of that main content (skip the first page)'}
4. Verify this is substantial text, not just a chapter heading

RULES:
- "Content page" means actual prose/text, not front matter
- For fiction: Usually starts at Chapter 1 or Part I
- For non-fiction: May start with Introduction, Chapter 1, or directly into content
- A "page" is approximately 250-400 words
- Preserve paragraph breaks

Return in this format:
REASONING: [Your step-by-step analysis of where content starts and why]
---
PAGE_TEXT:
[The extracted page text here]

BOOK TEXT (first 30,000 characters):
${bookText.substring(0, 30000)}`
    }]
  });

  return parsePageExtraction(extractTextContent(response), targetPageNumber);
}

/**
 * Fetches full OCR text from Internet Archive.
 * Tries multiple text formats with fallback.
 */
async function fetchBookFromArchive(bookInfo: BookInfo): Promise<string> {
  // Search Internet Archive
  const searchUrl = `https://archive.org/advancedsearch.php?q=title:(${encodeURIComponent(bookInfo.title)})+AND+creator:(${encodeURIComponent(bookInfo.author)})&fl=identifier,title&output=json&rows=5`;

  const searchResponse = await axios.get(searchUrl, { timeout: 10000 });

  if (searchResponse.data.response.docs.length === 0) {
    throw new Error('Book not available in digital archives. Try another book.');
  }

  // Get the best matching book
  const doc = searchResponse.data.response.docs[0];
  const identifier = doc.identifier;

  // Fetch full text (DjVu TXT format - OCR'd text)
  try {
    const textUrl = `https://archive.org/stream/${identifier}/${identifier}_djvu.txt`;
    const textResponse = await axios.get(textUrl, { timeout: 15000 });
    return textResponse.data;
  } catch {
    // Try alternate format
    try {
      const altUrl = `https://archive.org/download/${identifier}/${identifier}.txt`;
      const altResponse = await axios.get(altUrl, { timeout: 15000 });
      return altResponse.data;
    } catch {
      throw new Error('Book text not available for this title. Try another book.');
    }
  }
}

/**
 * Parses AI's chain-of-thought response.
 * Extracts reasoning and page text, with fallback parsing.
 * Uses indexOf instead of split to avoid corrupting fiction text with --- scene breaks.
 */
export function parsePageExtraction(
  aiResponse: string,
  expectedPageNum: number
): PageExtraction {

  // Use indexOf for first --- delimiter only (split would break on scene breaks in fiction)
  const delimiterIndex = aiResponse.indexOf('---');

  if (delimiterIndex === -1) {
    // Fallback: try to find PAGE_TEXT section
    const pageMatch = aiResponse.match(/PAGE_TEXT:\s*([\s\S]+)/);
    if (!pageMatch) {
      throw new Error('AI did not return page text in expected format');
    }
    return {
      pageText: pageMatch[1].trim(),
      pageNumber: expectedPageNum,
      reasoning: 'Content extracted (reasoning not parsed)'
    };
  }

  const reasoningSection = aiResponse.substring(0, delimiterIndex);
  const textSection = aiResponse.substring(delimiterIndex + 3);

  const reasoningMatch = reasoningSection.match(/REASONING:\s*([\s\S]+)/);
  const textMatch = textSection.match(/PAGE_TEXT:\s*([\s\S]+)/);

  const reasoning = reasoningMatch?.[1].trim() || 'Content location identified';
  const pageText = textMatch?.[1].trim() || textSection.trim();

  // Validate we got substantial text (at least 50 words)
  const wordCount = pageText.split(/\s+/).length;
  if (wordCount < 50) {
    throw new Error('Extracted text too short - book may not have preview available');
  }

  return {
    pageText,
    pageNumber: expectedPageNum,
    reasoning
  };
}
