import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

export async function generateCommentary(outcome: string, batterName: string): Promise<string | null> {
  const provider = process.env.AI_PROVIDER
  if (!provider) return null

  const prompt = `You are an enthusiastic baseball radio announcer. Generate exactly 2 sentences of exciting play-by-play commentary for this at-bat result: ${batterName} had a ${outcome}. Be vivid and energetic. Output only the 2 sentences, nothing else.`

  try {
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return null
      const client = new OpenAI({ apiKey })
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      })
      return response.choices[0]?.message?.content?.trim() ?? null
    }

    if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) return null
      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = response.content[0]
      return block?.type === 'text' ? block.text.trim() : null
    }

    return null
  } catch {
    return null
  }
}
