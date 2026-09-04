/** Pure types for hierarchical compaction. No I/O — event rows in, digest items out. */

export interface DigestEvent {
  id: number;
  symbol: string;
  ts: Date;
  kind: string;
  payload: Record<string, unknown>;
  significance: number | null;
  explanation: string | null;
}

export type DigestTier = 'recent' | 'episode' | 'chapter';

/**
 * What kind of thing this item actually is, for the UI to badge it
 * distinctly — 'structural_break' is the headline differentiator of the
 * whole product, so it shouldn't render identically to a routine move.
 * An episode/chapter item folding several moves together is labeled
 * 'structural_break' if any of the folded events were one, 'residual_move'
 * otherwise; 'resolved' means the displayed text is a resolution's, not
 * the original trigger's (see compact.ts's resolved-move folding).
 */
export type DigestItemKind = 'residual_move' | 'structural_break' | 'corporate_action' | 'resolved';

export interface DigestItem {
  tier: DigestTier;
  kind: DigestItemKind;
  symbol: string;
  headline: string;
  /** Every underlying event id folded into this item (originals + their resolutions), for cursor/debug purposes. */
  eventIds: number[];
  fromTs: string;
  toTs: string;
  /**
   * Set only by resolution-notes.ts when a resolution clause was attached.
   * Duplicates the tail of `headline` in plain text so Simple mode (which
   * replaces `headline` with a generic sentence) can still surface it —
   * the outcome must stay visible regardless of toggle state.
   */
  resolutionNote?: string;
}
