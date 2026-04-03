const Anthropic = require('@anthropic-ai/sdk');
const { buildPromptForMember } = require('./context-manager');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

async function streamMemberResponse(member, promptData, onToken, onComplete, onError) {
  try {
    const stream = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // Exact model string requested
      max_tokens: 1000,
      system: promptData.system,
      messages: promptData.messages,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta && chunk.delta.type === 'text_delta') {
        const text = chunk.delta.text;
        fullText += text;
        if (typeof onToken === 'function') {
          onToken(text);
        }
      }
    }
    
    if (typeof onComplete === 'function') {
      onComplete(fullText);
    }
  } catch (error) {
    if (typeof onError === 'function') {
      onError(error);
    } else {
      console.error('Anthropic stream error:', error);
    }
  }
}

function parseQuestion(text) {
  if (!text) return null;
  // Use regex with 'i' (case insensitive) and 's' (dot matches newline) flags
  // to grab everything inside [QUESTION FOR USER: ...]
  const regex = /\[QUESTION FOR USER:\s*([\s\S]*?)\]/is;
  const match = text.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

module.exports = {
  streamMemberResponse,
  parseQuestion
};
