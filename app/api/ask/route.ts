/**
 * POST /api/ask
 * body: { question: string }
 *
 * Retrieval against the real `events` table (src/lib/ask-log.ts) — no
 * LLM call, no hallucination risk, every sentence in the answer is an
 * explanation string the significance engine already generated. Gated
 * by the same user_id cookie as everything else (src/lib/current-user.ts).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { askLog } from '../../../src/lib/ask-log';
import { hasSession, getCurrentUserId } from '../../../src/lib/current-user';

const MAX_QUESTION_LENGTH = 300;

interface AskBody {
  question?: unknown;
}

export async function POST(request: NextRequest) {
  if (!(await hasSession())) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AskBody | null;
  if (!body || typeof body.question !== 'string' || body.question.trim().length === 0) {
    return NextResponse.json({ error: 'question (non-empty string) is required' }, { status: 400 });
  }
  if (body.question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ error: `question must be under ${MAX_QUESTION_LENGTH} characters` }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  const result = await askLog(body.question, userId);
  return NextResponse.json(result);
}
