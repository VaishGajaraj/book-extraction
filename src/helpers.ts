import Anthropic from '@anthropic-ai/sdk';

export function extractTextContent(response: Anthropic.Messages.Message): string {
  const block = response.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('No text content in response');
  return block.text;
}
