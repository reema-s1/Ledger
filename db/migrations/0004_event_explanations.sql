-- The "possible explanation" lookup (llm-addition.md): an on-demand,
-- search-grounded LLM hypothesis for a flagged significance event, kept
-- entirely separate from the deterministic event log. This table is a
-- cache keyed by event id, never a modification of `events.explanation` -
-- the significance engine's own explanation stays the one certain fact;
-- this is a clearly-separate, dismissible, sourced guess on top of it.

CREATE TABLE event_explanations (
  event_id             bigint PRIMARY KEY REFERENCES events(id),
  found                boolean NOT NULL,
  explanation_hypothesis text,
  source_url           text,
  source_title          text,
  generated_at          timestamptz NOT NULL DEFAULT now()
);
