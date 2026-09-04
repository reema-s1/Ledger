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

export interface DigestItem {
  tier: DigestTier;
  symbol: string;
  headline: string;
  /** Every underlying event id folded into this item (originals + their resolutions), for cursor/debug purposes. */
  eventIds: number[];
  fromTs: string;
  toTs: string;
}
