# Book Extraction AI



https://github.com/user-attachments/assets/ae8a88ca-c96f-40b5-ab89-052d19469359



An AI pipeline that extracts text from a book's opening pages given only a photo of its cover. The system identifies the book, determines its genre, retrieves the full text from a digital archive, and uses chain-of-thought reasoning to locate and return the correct content page.

**Input**: Photo of a book cover
**Output**: Page 1 text (non-fiction) or page 2 text (fiction)

## Architecture

The pipeline orchestrates three Claude models and two external APIs across four steps:

```
  Upload Image
       │
       ▼
  1. Validate (Claude Sonnet 4.5 Vision)
     Role-based prompt → structured YES/NO verdict
       │
       ▼
  2. Identify (Claude Sonnet 4.5 Vision)
     JSON schema enforcement → title, author, ISBN, confidence
       │
       ▼
  3. Classify (Google Books API + Claude Haiku)
     Metadata lookup → AI genre classification → fiction/non-fiction
       │
       ▼
  4. Extract (Internet Archive + Claude Sonnet 4.5 Text)
     Fetch OCR text → chain-of-thought page extraction
       │
       ▼
  Return page text + metadata + reasoning
```

**Model routing**: Sonnet 4.5 handles vision and complex text reasoning. Haiku handles classification at ~$0.0002/call. This keeps the expensive model where it matters and the cheap model where speed and cost matter.

## Key Engineering Decisions

### Prompt Engineering

Each step uses a different prompting strategy matched to the task:

**Structured output** (identification) — JSON schema in the prompt with confidence self-assessment. Defensive multi-layer parsing handles responses wrapped in markdown, preamble text, or malformed JSON.

**Chain-of-thought** (extraction) — Step-by-step reasoning to distinguish front matter from content pages. The model explains its logic before extracting, which significantly improves accuracy on edge cases like books with long forewords or unusual structures.

**Role-based** (validation) — Assigns the model a specific validator role with explicit accept/reject criteria. Generates user-facing error messages directly.

### Genre Classification with Claude Haiku

Replaced a regex-based classifier (`/fiction|novel|mystery|thriller/i`) with a Claude Haiku call. The regex missed horror, drama, satire, literary fiction, young adult, and dystopian genres. Haiku handles all of these correctly and can classify books even when Google Books returns no categories — it already knows most published books.

### The `---` Delimiter Fix

The page extraction prompt uses `REASONING: ... --- PAGE_TEXT: ...` as output format. The original implementation split on `---`, which corrupted fiction text containing scene break markers (extremely common). Fixed by using `indexOf` to find only the first delimiter.

### Safe Response Access

All Claude API responses go through a typed `extractTextContent()` helper instead of raw `response.content[0].text`. This prevents runtime crashes on unexpected response shapes (e.g., tool-use blocks, empty content arrays).

### Shared Pipeline

Both the Express API and CLI call the same `runPipeline()` function. A custom `PipelineValidationError` class lets the server distinguish 400 (bad input) from 500 (internal failure) without duplicating orchestration logic.

## Running Locally

```bash
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# Unit tests (no API key needed)
npm run eval

# Full pipeline on test images
npm run integration

# Single image
npm run cli -- ./images/fiction.jpg

# Web UI
npm run dev
# Open http://localhost:3000
```

### Test Images

| Image | Book | Expected Genre | Expected Page |
|-------|------|---------------|---------------|
| `images/fiction.jpg` | The Casebook of Sherlock Holmes — Arthur Conan Doyle | Fiction | 2 |
| `images/nonfiction.jpg` | Forensics — Val McDermid | Non-Fiction | 1 |

## Project Structure

```
src/
├── services/
│   ├── bookValidation.ts      # Claude Vision: is this a book cover?
│   ├── bookIdentification.ts  # Claude Vision: extract title/author/ISBN
│   ├── bookData.ts            # Google Books + Claude Haiku: genre classification
│   └── textExtraction.ts      # Internet Archive + Claude Text: page extraction
├── pipeline.ts                # Shared 4-step orchestration
├── anthropic.ts               # Single shared Anthropic client
├── helpers.ts                 # extractTextContent() safe response helper
├── types.ts                   # TypeScript interfaces
├── index.ts                   # Express server
├── cli.ts                     # CLI interface
├── eval.ts                    # 29 unit tests for parsing logic
└── integration.ts             # End-to-end tests on real images
```

## Testing

**`npm run eval`** — 29 offline tests covering:
- JSON parsing with fallbacks (clean JSON, markdown-wrapped, preamble text)
- Input sanitization (ISBN normalization, whitespace, confidence defaults)
- Validation response parsing (case-insensitive, missing fields, multi-line)
- Google Books response parsing (standard, missing fields, empty results)
- Safe content extraction (valid, empty, mixed block types)
- Page extraction delimiter handling (well-formed, missing delimiter, scene breaks)

**`npm run integration`** — Runs both test images through the full pipeline and validates: correct genre classification, correct page number, sufficient text length, complete response structure.

## Cost Per Request

| Step | Model | Cost |
|------|-------|------|
| Validate | Sonnet 4.5 | ~$0.005 |
| Identify | Sonnet 4.5 | ~$0.005 |
| Classify | Haiku | ~$0.0002 |
| Extract | Sonnet 4.5 | ~$0.01 |
| **Total** | | **~$0.02/request** |

## API

**POST /api/extract** — Upload a book cover image, returns extracted page text.

```bash
curl -X POST http://localhost:3000/api/extract -F "image=@cover.jpg"
```

```json
{
  "book": {
    "title": "The Casebook of Sherlock Holmes",
    "author": "Arthur Conan Doyle",
    "genre": "Fiction",
    "categories": ["Fiction", "Mystery & Detective"]
  },
  "page": {
    "number": 2,
    "text": "I fear that Mr. Sherlock Holmes may become like one of those..."
  },
  "debug": {
    "confidence": "high",
    "reasoning": "Front matter includes title page and contents. Chapter I begins..."
  }
}
```

**GET /api/health** — Returns `{ "status": "ok" }`.

## What I'd Do Next

- **Caching**: Redis layer for Google Books + Internet Archive lookups (most books are looked up repeatedly)
- **Confidence routing**: Low-confidence identifications → ask user to confirm before proceeding
- **Streaming**: Stream extraction step progress to the frontend via SSE
- **Observability**: Token usage tracking per step, latency percentiles, success/failure rates
- **Fallback chain**: Google Books → OpenLibrary → Internet Archive metadata for better coverage
