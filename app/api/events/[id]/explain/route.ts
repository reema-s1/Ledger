/**
 * POST /api/events/:id/explain
 *
 * "Find possible explanation" (llm-addition.md) — on-demand only, never
 * called from the worker or any background path. Cached by event id: a
 * second click (same or different user) returns the stored result
 * instead of re-running the search/LLM call.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { isExplanationLookupEnabled } from '../../../../../src/lib/feature-flags';
import { hasSession } from '../../../../../src/lib/current-user';
import { getEvent } from '../../../../../db/queries/events';
import { getSymbol } from '../../../../../db/queries/symbols';
import { getEventExplanation, upsertEventExplanation } from '../../../../../db/queries/event-explanations';
import { lookupExplanation } from '../../../../../src/lib/explanation-lookup';

const EXPLAINABLE_KINDS = new Set(['residual_move', 'structural_break']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isExplanationLookupEnabled()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!(await hasSession())) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (!Number.isFinite(eventId)) {
    return NextResponse.json({ error: 'invalid event id' }, { status: 400 });
  }

  const cached = await getEventExplanation(eventId);
  if (cached) {
    return NextResponse.json({
      found: cached.found,
      hypothesis: cached.explanation_hypothesis,
      sourceUrl: cached.source_url,
      sourceTitle: cached.source_title,
    });
  }

  const event = await getEvent(eventId);
  if (!event) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 });
  }
  if (!EXPLAINABLE_KINDS.has(event.kind)) {
    return NextResponse.json({ error: 'this event kind is not eligible for a lookup' }, { status: 400 });
  }

  const symbolMeta = await getSymbol(event.symbol);
  const companyName = symbolMeta?.name ?? event.symbol;

  let result;
  try {
    result = await lookupExplanation(event.symbol, companyName, event.ts);
  } catch (err) {
    // Never surface a raw error, and never let this feature block or
    // degrade the rest of the app — a neutral "couldn't check" beats a
    // stack trace, and nothing else on the page depends on this succeeding.
    console.error(`[explain] lookup failed for event ${eventId}:`, err);
    return NextResponse.json({ found: false, hypothesis: null, sourceUrl: null, sourceTitle: null, error: 'lookup-failed' });
  }

  await upsertEventExplanation({
    eventId,
    found: result.found,
    explanationHypothesis: result.hypothesis,
    sourceUrl: result.sourceUrl,
    sourceTitle: result.sourceTitle,
  });

  return NextResponse.json(result);
}
