import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockOpenAICreate, mockAnthropicCreate } = vi.hoisted(() => ({
  mockOpenAICreate: vi.fn(),
  mockAnthropicCreate: vi.fn(),
}))

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function() {
    return {
      chat: { completions: { create: mockOpenAICreate } },
    }
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function() {
    return {
      messages: { create: mockAnthropicCreate },
    }
  }),
}))

import { generateCommentary } from './commentary'

beforeEach(() => {
  mockOpenAICreate.mockReset()
  mockAnthropicCreate.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generateCommentary', () => {
  it('returns null when AI_PROVIDER is not set', async () => {
    vi.stubEnv('AI_PROVIDER', '')
    const result = await generateCommentary('HOME RUN', 'J. Smith')
    expect(result).toBeNull()
  })

  it('returns null for an unknown provider', async () => {
    vi.stubEnv('AI_PROVIDER', 'gemini')
    const result = await generateCommentary('HOME RUN', 'J. Smith')
    expect(result).toBeNull()
  })

  it('returns null when provider is openai but OPENAI_API_KEY is not set', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', '')
    const result = await generateCommentary('HOME RUN', 'J. Smith')
    expect(result).toBeNull()
    expect(mockOpenAICreate).not.toHaveBeenCalled()
  })

  it('returns null when provider is anthropic but ANTHROPIC_API_KEY is not set', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const result = await generateCommentary('STRIKEOUT', 'M. Jones')
    expect(result).toBeNull()
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('calls OpenAI and returns trimmed commentary when provider is openai', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: '  What a blast by J. Smith!  ' } }],
    })

    const result = await generateCommentary('HOME RUN', 'J. Smith')

    expect(result).toBe('What a blast by J. Smith!')
    expect(mockOpenAICreate).toHaveBeenCalledOnce()
    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        max_tokens: 100,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
        ]),
      })
    )
  })

  it('calls Anthropic and returns trimmed commentary when provider is anthropic', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: '  Amazing catch by M. Jones!  ' }],
    })

    const result = await generateCommentary('FLYOUT', 'M. Jones')

    expect(result).toBe('Amazing catch by M. Jones!')
    expect(mockAnthropicCreate).toHaveBeenCalledOnce()
    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user' }),
        ]),
      })
    )
  })

  it('returns null when Anthropic response has no text block', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    mockAnthropicCreate.mockResolvedValue({ content: [] })

    const result = await generateCommentary('WALK', 'B. Williams')
    expect(result).toBeNull()
  })

  it('returns null when OpenAI throws (graceful degradation)', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    mockOpenAICreate.mockRejectedValue(new Error('quota exceeded'))

    const result = await generateCommentary('DOUBLE', 'K. Brown')
    expect(result).toBeNull()
  })

  it('returns null when Anthropic throws (graceful degradation)', async () => {
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test')
    mockAnthropicCreate.mockRejectedValue(new Error('API error'))

    const result = await generateCommentary('TRIPLE', 'R. Davis')
    expect(result).toBeNull()
  })
})
