import { BookInfo } from '../types';
import { anthropic } from '../anthropic';
import { extractTextContent } from '../helpers';

/**
 * Identifies book metadata from a cover image using Claude Vision.
 *
 * AI Engineering Showcase:
 * - JSON schema enforcement in prompt
 * - Confidence self-assessment
 * - Defensive multi-layer parsing (JSON → regex → fallback)
 * - Type validation and sanitization
 */
export async function identifyBook(
  imageBase64: string,
  mediaType: string = 'image/jpeg'
): Promise<BookInfo> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType as 'image/jpeg', data: imageBase64 }
        },
        {
          type: "text",
          // PROMPT ENGINEERING: Schema + confidence + examples
          text: `Extract book metadata from this cover image.

Return ONLY valid JSON matching this schema:
{
  "title": string,     // Full title exactly as shown (including subtitle)
  "author": string,    // Primary author (or "FirstName LastName & Others" if multiple)
  "isbn": string|null, // ISBN-10 or ISBN-13 if visible, else null
  "confidence": string // "high" if all text clear, "medium" if some unclear, "low" if guessing
}

Rules:
- Extract exact text, don't correct spelling
- For series books, include series name in title
- If multiple authors, use first name + "& Others"
- ISBN must be numbers only (no dashes)
- Confidence: high = 95%+ sure, medium = 70-95%, low = <70%

Return ONLY the JSON, no explanation.`
        }
      ]
    }]
  });

  return parseBookInfo(extractTextContent(response));
}

/**
 * Parses AI response with multiple fallback strategies.
 * Handles: pure JSON, JSON in markdown, malformed responses.
 */
export function parseBookInfo(aiResponse: string): BookInfo {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(aiResponse);
    return validateBookInfo(parsed);
  } catch {
    // Extract JSON from markdown code blocks or wrapped text
    const jsonMatch = aiResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
      || aiResponse.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('AI did not return valid JSON');
    }

    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      return validateBookInfo(parsed);
    } catch (e) {
      throw new Error('Could not parse book information from image');
    }
  }
}

/**
 * Validates and sanitizes parsed book data.
 * Ensures type safety and reasonable defaults.
 */
export function validateBookInfo(data: any): BookInfo {
  if (!data.title || !data.author) {
    throw new Error('Missing required book information');
  }

  return {
    title: String(data.title).trim(),
    author: String(data.author).trim(),
    isbn: data.isbn ? String(data.isbn).replace(/[^0-9]/g, '') : null,
    confidence: ['high', 'medium', 'low'].includes(data.confidence)
      ? data.confidence
      : 'medium'
  };
}
