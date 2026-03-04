/**
 * Eval test set for parsing functions.
 * Run: npm run eval
 */
import { parseBookInfo, validateBookInfo } from './services/bookIdentification';
import { parseValidationResponse } from './services/bookValidation';
import { parseGoogleBooksResponse } from './services/bookData';
import { parsePageExtraction } from './services/textExtraction';
import { extractTextContent } from './helpers';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e: any) {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(condition: boolean, msg = 'Assertion failed') {
  if (!condition) throw new Error(msg);
}

function assertThrows(fn: () => void, msg = 'Expected function to throw') {
  try {
    fn();
    throw new Error(msg);
  } catch (e: any) {
    if (e.message === msg) throw e;
  }
}

// ─── parseBookInfo ──────────────────────────────────────────

console.log('\nparseBookInfo:');

test('parses clean JSON', () => {
  const result = parseBookInfo('{"title":"Dune","author":"Frank Herbert","isbn":"0441172717","confidence":"high"}');
  assert(result.title === 'Dune');
  assert(result.author === 'Frank Herbert');
  assert(result.isbn === '0441172717');
  assert(result.confidence === 'high');
});

test('parses markdown-wrapped JSON', () => {
  const result = parseBookInfo('```json\n{"title":"1984","author":"George Orwell","isbn":null,"confidence":"high"}\n```');
  assert(result.title === '1984');
  assert(result.author === 'George Orwell');
  assert(result.isbn === null);
});

test('parses JSON with preamble text', () => {
  const result = parseBookInfo('Here is the metadata:\n{"title":"Neuromancer","author":"William Gibson","isbn":null,"confidence":"medium"}');
  assert(result.title === 'Neuromancer');
  assert(result.confidence === 'medium');
});

test('throws on no JSON', () => {
  assertThrows(() => parseBookInfo('I cannot identify this book'));
});

test('throws on missing required fields', () => {
  assertThrows(() => parseBookInfo('{"title":"Dune"}'));
});

// ─── validateBookInfo ───────────────────────────────────────

console.log('\nvalidateBookInfo:');

test('sanitizes ISBN (removes dashes)', () => {
  const result = validateBookInfo({ title: 'Test', author: 'Author', isbn: '978-0-441-17271-9', confidence: 'high' });
  assert(result.isbn === '9780441172719');
});

test('defaults confidence to medium for unknown values', () => {
  const result = validateBookInfo({ title: 'Test', author: 'Author', isbn: null, confidence: 'very high' });
  assert(result.confidence === 'medium');
});

test('trims whitespace', () => {
  const result = validateBookInfo({ title: '  Dune  ', author: '  Frank Herbert  ', isbn: null, confidence: 'high' });
  assert(result.title === 'Dune');
  assert(result.author === 'Frank Herbert');
});

test('handles null ISBN', () => {
  const result = validateBookInfo({ title: 'Test', author: 'Author', isbn: null, confidence: 'low' });
  assert(result.isbn === null);
});

// ─── parseValidationResponse ────────────────────────────────

console.log('\nparseValidationResponse:');

test('parses YES verdict', () => {
  const result = parseValidationResponse('VERDICT: YES\nREASON: Clear book cover with readable text');
  assert(result.isValid === true);
  assert(result.message === 'Book cover validated successfully');
});

test('parses NO verdict', () => {
  const result = parseValidationResponse('VERDICT: NO\nREASON: Image is too blurry to read');
  assert(result.isValid === false);
  assert(result.message === 'Image is too blurry to read');
});

test('case insensitive verdict', () => {
  const result = parseValidationResponse('VERDICT: yes\nREASON: Looks good');
  assert(result.isValid === true);
});

test('handles extra whitespace', () => {
  const result = parseValidationResponse('VERDICT:   NO  \nREASON:   Not a book  ');
  assert(result.isValid === false);
  assert(result.message.includes('Not a book'));
});

test('handles missing reason', () => {
  const result = parseValidationResponse('VERDICT: NO');
  assert(result.isValid === false);
  assert(result.message === 'Could not validate image');
});

test('handles multi-line response with preamble', () => {
  const result = parseValidationResponse('Let me analyze this image.\n\nVERDICT: YES\nREASON: This is a clear photo of a book cover');
  assert(result.isValid === true);
});

// ─── parseGoogleBooksResponse ───────────────────────────────

console.log('\nparseGoogleBooksResponse:');

test('parses standard Google Books response', () => {
  const data = {
    items: [{
      volumeInfo: {
        title: 'The Great Gatsby',
        authors: ['F. Scott Fitzgerald'],
        categories: ['Fiction', 'Classics'],
      }
    }]
  };
  const result = parseGoogleBooksResponse(data, 'fallback', 'fallback');
  assert(result.title === 'The Great Gatsby');
  assert(result.authors[0] === 'F. Scott Fitzgerald');
  assert(result.categories.length === 2);
  assert(result.categories[0] === 'Fiction');
});

test('handles missing fields in volumeInfo', () => {
  const data = {
    items: [{
      volumeInfo: {
        title: 'Some Book',
      }
    }]
  };
  const result = parseGoogleBooksResponse(data, 'Fallback Title', 'Fallback Author');
  assert(result.title === 'Some Book');
  assert(result.authors[0] === 'Fallback Author');
  assert(result.categories.length === 0);
});

test('falls back when no items returned', () => {
  const result = parseGoogleBooksResponse({ items: [] }, 'My Book', 'My Author');
  assert(result.title === 'My Book');
  assert(result.authors[0] === 'My Author');
  assert(result.categories.length === 0);
});

test('falls back when items is undefined', () => {
  const result = parseGoogleBooksResponse({}, 'My Book', 'My Author');
  assert(result.title === 'My Book');
  assert(result.authors[0] === 'My Author');
});

test('handles multiple authors', () => {
  const data = {
    items: [{
      volumeInfo: {
        title: 'Coauthored Book',
        authors: ['Author One', 'Author Two'],
        categories: ['Science'],
      }
    }]
  };
  const result = parseGoogleBooksResponse(data, 'fallback', 'fallback');
  assert(result.authors.length === 2);
  assert(result.authors[1] === 'Author Two');
});

// ─── extractTextContent ─────────────────────────────────────

console.log('\nextractTextContent:');

test('extracts text from valid response', () => {
  const response = {
    content: [{ type: 'text' as const, text: 'Hello world' }],
  } as any;
  assert(extractTextContent(response) === 'Hello world');
});

test('throws on empty content array', () => {
  const response = { content: [] } as any;
  assertThrows(() => extractTextContent(response));
});

test('finds text block among mixed types', () => {
  const response = {
    content: [
      { type: 'tool_use', id: '1', name: 'test', input: {} },
      { type: 'text' as const, text: 'Found it' },
    ],
  } as any;
  assert(extractTextContent(response) === 'Found it');
});

// ─── parsePageExtraction ────────────────────────────────────

console.log('\nparsePageExtraction:');

const sampleText = Array(60).fill('word').join(' ');

test('parses well-formed REASONING/PAGE_TEXT', () => {
  const response = `REASONING: The book starts at Chapter 1 on page 5.\n---\nPAGE_TEXT:\n${sampleText}`;
  const result = parsePageExtraction(response, 1);
  assert(result.reasoning.includes('Chapter 1'));
  assert(result.pageText === sampleText);
  assert(result.pageNumber === 1);
});

test('falls back when missing delimiter', () => {
  const response = `PAGE_TEXT:\n${sampleText}`;
  const result = parsePageExtraction(response, 2);
  assert(result.pageText === sampleText);
  assert(result.pageNumber === 2);
  assert(result.reasoning === 'Content extracted (reasoning not parsed)');
});

test('throws when no PAGE_TEXT', () => {
  assertThrows(() => parsePageExtraction('Here is some random text without the expected format', 1));
});

test('throws when text too short (<50 words)', () => {
  const shortText = 'Chapter 1. It was a dark night.';
  assertThrows(() => parsePageExtraction(`REASONING: Found chapter 1\n---\nPAGE_TEXT:\n${shortText}`, 1));
});

test('preserves paragraph breaks', () => {
  const paragraphs = `${sampleText}\n\nSecond paragraph with more text to reach the word count. ${sampleText}`;
  const response = `REASONING: analysis\n---\nPAGE_TEXT:\n${paragraphs}`;
  const result = parsePageExtraction(response, 1);
  assert(result.pageText.includes('\n\n'));
});

test('preserves --- scene breaks in fiction text', () => {
  const fictionText = `${sampleText}\n\n---\n\nThe scene shifted. ${sampleText}`;
  const response = `REASONING: Chapter 1 found\n---\nPAGE_TEXT:\n${fictionText}`;
  const result = parsePageExtraction(response, 2);
  assert(result.pageText.includes('---'), 'Scene break --- should be preserved in page text');
  assert(result.pageText.includes('The scene shifted'));
  assert(result.reasoning.includes('Chapter 1'));
});

// ─── Summary ────────────────────────────────────────────────

console.log(`\n━━━ Results: ${passed} passed, ${failed} failed ━━━`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f}`));
}
process.exit(failed > 0 ? 1 : 0);
