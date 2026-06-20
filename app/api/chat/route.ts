import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/db'
import { chatMessages } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { eq, asc } from 'drizzle-orm'

const client = new Anthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL,
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: NextRequest) {
  const { userId, role } = await verifySession()

  const body = await req.json()
  const userMessage: string = body.message ?? ''

  if (!userMessage.trim()) {
    return Response.json({ reply: 'Please send a message.' }, { status: 400 })
  }

  // Load the last 20 messages for this user (ascending so oldest first)
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(20)

  // Build Anthropic messages array from history then append new user turn
  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = history.map(
    (m) => ({ role: m.role as 'user' | 'assistant', content: m.content }),
  )
  anthropicMessages.push({ role: 'user', content: userMessage })

  const systemPrompt = `You are Dave Aredo, a helpful project-management assistant for TRT Arredo, a furniture manufacturing & installation company. The user's role is ${role}. Be concise and practical.`

  let replyText = ''

  try {
    const msg = await client.messages.create({
      model: process.env.LLM_MODEL_NAME ?? 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: anthropicMessages,
    })

    replyText =
      msg.content?.[0]?.type === 'text' ? (msg.content[0] as { type: 'text'; text: string }).text : ''
  } catch {
    const baseUrl = process.env.ANTHROPIC_BASE_URL ?? ''
    return Response.json(
      {
        reply:
          "I couldn't reach the AI model. If you're in local dev, make sure Ollama is running on " +
          baseUrl +
          '.',
      },
      { status: 200 },
    )
  }

  // Persist user message then assistant reply
  await db.insert(chatMessages).values({ userId, role: 'user', content: userMessage })
  await db.insert(chatMessages).values({ userId, role: 'assistant', content: replyText })

  return Response.json({ reply: replyText })
}
