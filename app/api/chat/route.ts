import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { db } from '@/db'
import { chatMessages, chatSessions } from '@/db/schema'
import { verifySession } from '@/lib/dal'
import { eq, asc, and } from 'drizzle-orm'

const client = new Anthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL,
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const ROLE_LABELS: Record<string, string> = {
  factory_pm: 'Factory Project Manager (manages manufacturing-floor delivery & sorting checklists)',
  site_pm: 'Site Project Manager (manages on-site delivery, verification & installation)',
  super_admin: 'Super Admin (oversees all projects, read-only across roles)',
  operations: 'Operations (Head of Projects — creates projects, sets deadlines, full admin oversight)',
}

/**
 * Paul Arredo's persona — a PMI-certified project manager, modelled on the
 * spirit of PMI Infinity: standards-grounded, trustworthy, practical guidance.
 */
function SYSTEM_PROMPT(role: string): string {
  const who = ROLE_LABELS[role] ?? role
  return [
    'You are Paul Arredo, the AI project-management assistant for TRT Arredo — a company that designs, manufactures and installs bespoke furniture.',
    '',
    'PERSONA',
    '- You are an experienced, PMI-certified project manager (think PMP) and you reason the way PMI Infinity does: grounded in established project-management standards, never improvised.',
    '- Your guidance is anchored in PMI thinking — the PMBOK Guide principles and performance domains (stakeholders, team, development approach & life cycle, planning, project work, delivery, measurement, uncertainty), and the PMI Code of Ethics (responsibility, respect, fairness, honesty).',
    '- You are fluent across predictive (waterfall), agile, and hybrid approaches and you recommend the one that fits the situation rather than dogmatically pushing one.',
    '',
    'HOW YOU RESPOND',
    '- Be concise, professional, and practical. Lead with the answer, then the reasoning.',
    '- Format every reply in clean Markdown: short paragraphs, **bold** for key terms, bulleted or numbered lists for steps, `code` for exact field/button names, and tables when comparing options.',
    '- Use proper PM terminology (scope, schedule, risk register, RAID, stakeholder register, change control, lessons learned) but briefly explain a term the first time when the user may be non-expert.',
    '- Tie advice to TRT Arredo’s real flow: delivery & sorting checklists on the factory floor, site readiness, confirmation/verification with photo evidence, issue logs, and process flow charts.',
    '- Ask a clarifying question when the request is ambiguous instead of guessing.',
    '- Never fabricate company policy, project data, or PMI citations. If you don’t know, say so and suggest how to find out.',
    '',
    `CURRENT USER`,
    `- The person you are helping is a ${who}. Tailor scope and detail to that role.`,
  ].join('\n')
}

function titleFrom(message: string): string {
  const t = message.trim().replace(/\s+/g, ' ')
  return t.length > 60 ? t.slice(0, 57) + '…' : t || 'New chat'
}

export async function POST(req: NextRequest) {
  const { userId, role } = await verifySession()

  const body = await req.json()
  const userMessage: string = (body.message ?? '').toString()
  let sessionId: string | null = body.sessionId ?? null

  if (!userMessage.trim()) {
    return Response.json({ reply: 'Please send a message.' }, { status: 400 })
  }

  // Resolve the conversation: reuse the caller's session (verifying ownership)
  // or open a new one titled from this first message.
  let title = 'New chat'
  if (sessionId) {
    const [owned] = await db
      .select({ id: chatSessions.id, title: chatSessions.title })
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
      .limit(1)
    if (!owned) sessionId = null
    else title = owned.title
  }
  if (!sessionId) {
    title = titleFrom(userMessage)
    const [created] = await db
      .insert(chatSessions)
      .values({ userId, title })
      .returning({ id: chatSessions.id })
    sessionId = created.id
  }

  // Conversation context: this session's messages, oldest→newest.
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sessionId, sessionId)))
    .orderBy(asc(chatMessages.createdAt))
    .limit(40)

  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = history.map(
    (m) => ({ role: m.role as 'user' | 'assistant', content: m.content }),
  )
  anthropicMessages.push({ role: 'user', content: userMessage })

  let replyText = ''
  try {
    const msg = await client.messages.create({
      model: process.env.LLM_MODEL_NAME ?? 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      system: SYSTEM_PROMPT(role),
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
        sessionId,
        title,
      },
      { status: 200 },
    )
  }

  await db.insert(chatMessages).values({ userId, sessionId, role: 'user', content: userMessage })
  await db.insert(chatMessages).values({ userId, sessionId, role: 'assistant', content: replyText })
  await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId))

  return Response.json({ reply: replyText, sessionId, title })
}

/** Messages for one session (oldest→newest). Requires ?sessionId. */
export async function GET(req: NextRequest) {
  const { userId } = await verifySession()
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  if (!sessionId) return Response.json({ messages: [] })

  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(and(eq(chatMessages.userId, userId), eq(chatMessages.sessionId, sessionId)))
    .orderBy(asc(chatMessages.createdAt))
    .limit(500)

  return Response.json({ messages: rows.map((m) => ({ role: m.role, content: m.content })) })
}
