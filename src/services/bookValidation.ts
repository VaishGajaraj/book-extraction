import { ValidationResult } from '../types';
import { anthropic } from '../anthropic';
import { extractTextContent } from '../helpers';

/**
 * Validates that an uploaded image is a clear, readable book cover.
 *
 * AI Engineering Showcase:
 * - Role-based prompting ("You are a book cover validator")
 * - Structured output format (VERDICT/REASON)
 * - User-facing error message generation
 * - Clear validation criteria
 */
export async function validateBookCover(
  imageBase64: string,
  mediaType: string = 'image/jpeg'
): Promise<ValidationResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 150,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType as 'image/jpeg', data: imageBase64 }
        },
        {
          type: "text",
          // PROMPT ENGINEERING: Explicit format, helpful feedback for user
          text: `You are a book cover validator for an AI system.

Task: Determine if this image is a clear, readable photo of a SINGLE book cover.

Valid: Clear book cover, readable title/author, good lighting, single book
Invalid: Multiple books, blurry, partial cover, not a book, screenshot of book

Respond in this exact format:
VERDICT: [YES or NO]
REASON: [One sentence explaining why, user-facing language]

If NO, suggest how to retake the photo.`
        }
      ]
    }]
  });

  return parseValidationResponse(extractTextContent(response));
}

export function parseValidationResponse(text: string): ValidationResult {
  const verdictMatch = text.match(/VERDICT:\s*(YES|NO)/i);
  const reasonMatch = text.match(/REASON:\s*(.+)/i);

  const isValid = verdictMatch?.[1].toUpperCase() === 'YES';
  const reason = reasonMatch?.[1] || 'Could not validate image';

  return {
    isValid,
    message: isValid ? "Book cover validated successfully" : reason
  };
}
