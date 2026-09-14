/**
 * The one network call every OpenRouter-backed feature in this app makes
 * (currently explanation-lookup.ts and ask-log.ts's LLM-assisted parsing/
 * rephrasing) — shared purely to avoid copy-pasting the same fetch/auth/
 * error-handling, not a shared dependency between those features'
 * business logic, which stays independent so each can still be cut on
 * its own flag without touching the other.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// A named model, not `openrouter/free` (a router across whatever free
// models are currently available) — verified (3 real calls, same input)
// to silently switch models between calls and land on wildly unsuited
// ones, a code-completion model among them, with directly contradictory
// answers on identical input. This one is a genuinely free choice too,
// just without that per-call model-lottery risk. Picked after comparing
// several real free models on the same input: this one correctly
// distinguished similarly-named-but-different companies (e.g. "Bajaj
// Finance" vs "Bajaj Housing Finance") that other candidates conflated —
// the exact judgment call explanation-lookup's safety depends on, and a
// reasonable bar for ask-log's own grounding to meet too.
export const OPENROUTER_MODEL = 'inclusionai/ling-3.0-flash-fin:free';

export async function askOpenRouter(system: string, user: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter: empty response');
  return content;
}
