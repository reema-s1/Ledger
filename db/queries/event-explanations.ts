import { query, queryOne } from '../client';

export interface EventExplanationRow {
  event_id: number;
  found: boolean;
  explanation_hypothesis: string | null;
  source_url: string | null;
  source_title: string | null;
  generated_at: Date;
}

export interface UpsertEventExplanationInput {
  eventId: number;
  found: boolean;
  explanationHypothesis: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
}

/** The cached hypothesis for this event, if one has already been generated. */
export async function getEventExplanation(eventId: number): Promise<EventExplanationRow | null> {
  return queryOne<EventExplanationRow>('SELECT * FROM event_explanations WHERE event_id = $1', [eventId]);
}

/**
 * Idempotent by event_id — a second lookup for the same event (another
 * user, a retry) overwrites with the freshest attempt rather than erroring,
 * since this is a cache, not an audit log (unlike `events` itself).
 */
export async function upsertEventExplanation(input: UpsertEventExplanationInput): Promise<void> {
  await query(
    `INSERT INTO event_explanations (event_id, found, explanation_hypothesis, source_url, source_title, generated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (event_id) DO UPDATE SET
       found = EXCLUDED.found,
       explanation_hypothesis = EXCLUDED.explanation_hypothesis,
       source_url = EXCLUDED.source_url,
       source_title = EXCLUDED.source_title,
       generated_at = EXCLUDED.generated_at`,
    [input.eventId, input.found, input.explanationHypothesis, input.sourceUrl, input.sourceTitle],
  );
}
