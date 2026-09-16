'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  simulateMarketDay,
  simulateFeedDisagreement,
  simulateStaleness,
  simulateSplit,
  FEED_DRILL_DAY,
  SIM_CLUSTER_LABEL,
  SIM_SYMBOL,
  SPLIT_RATIO,
  type MarketDay,
  type PipelineResult,
  type SplitPhase,
} from '../../src/simulate/scenarios';
import { DEFAULT_CONFIG } from '../../src/significance/config';
import type { DigestItem } from '../../src/digest/types';
import type { QuoteQuality } from '../../worker/freshness';
import { IntervalRunner } from '../../worker/backpressure';
import { DigestCard } from './digest-card';
import { DataQualityNotice } from './data-quality-notice';
import { HeartbeatDot } from './heartbeat-dot';
import { SimpleDetailProvider } from './simple-detail-context';
import { SimpleDetailToggle } from './simple-detail-toggle';

const pillStyle = (active: boolean) => ({
  background: active ? 'var(--accent-soft)' : 'var(--surface)',
  border: '1px solid var(--rule)',
  borderRadius: 999,
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink)',
  cursor: 'pointer',
});

function signedPct(fraction: number, digits = 1): string {
  const pct = fraction * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

function rupees(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Drill({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius)',
        padding: '20px 22px',
        marginBottom: 20,
      }}
    >
      <h2 style={{ fontSize: 16, margin: '0 0 4px' }}>{title}</h2>
      <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '0 0 18px', lineHeight: 1.5, maxWidth: 620 }}>{summary}</p>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--ink-muted)', minWidth: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        {label}
        <span className="tabular" style={{ color: 'var(--ink)', fontWeight: 600 }}>
          {display}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </label>
  );
}

function ResultLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-faint)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '18px 0 8px' }}>
      {children}
    </p>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 13.5, color: 'var(--ink-muted)', margin: 0, lineHeight: 1.55, padding: '12px 14px', border: '1px dashed var(--rule)', borderRadius: 'var(--radius-sm)' }}>
      {children}
    </p>
  );
}

/** A pipeline result as the digest would render it — the real card component, minus mark-seen and news lookup. */
function cardItem(r: PipelineResult): DigestItem | null {
  const ts = `${r.sessionDate}T03:45:00.000Z`;
  const base = { tier: 'recent' as const, symbol: SIM_SYMBOL, eventIds: [1], fromTs: ts, toTs: ts };
  if (r.event) return { ...base, kind: r.event.kind, headline: r.event.explanation, decomposition: r.event.decomposition };
  if (r.action) {
    // Same sentence worker/ingest.ts writes for a corporate action.
    return { ...base, kind: 'corporate_action', headline: `${SIM_SYMBOL} executed a 1:${r.action.ratio} ${r.action.type} today.` };
  }
  return null;
}

function quietReason(r: PipelineResult): string {
  if (r.outcome === 'unconfirmed') return 'Not scored: the two feeds disagree, so this price is never used to raise an alert.';
  const d = r.decomposition;
  if (!d) return 'Not scored.';
  const z = Math.abs(d.residualZ);
  if (z < DEFAULT_CONFIG.residualZGate) {
    return `Nothing flagged. After removing what the market and the ${SIM_CLUSTER_LABEL} sector did, the move left over is ${z.toFixed(1)}σ — under the ${DEFAULT_CONFIG.residualZGate.toFixed(1)}σ bar.`;
  }
  return `Nothing flagged. The leftover move is ${z.toFixed(1)}σ, but on ${d.volumeRatio.toFixed(1)}x normal volume its volume-weighted score is ${d.volumeWeightedZ.toFixed(1)}, under ${DEFAULT_CONFIG.significanceThreshold.toFixed(1)} — a move hardly anyone traded isn't confirmed.`;
}

function Outcome({ result }: { result: PipelineResult }) {
  const item = cardItem(result);
  return (
    <>
      {item ? <DigestCard item={item} showAck={false} linkSymbol={false} /> : <Quiet>{quietReason(result)}</Quiet>}
      {result.reassurance && (
        <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: '10px 4px 0', color: 'var(--ink-muted)' }}>
          <span style={{ fontWeight: 600 }}>Shown under Explained moves:</span> {result.reassurance.explanation}
        </p>
      )}
    </>
  );
}

// --- 1. market selloff ------------------------------------------------------

const MARKET_PRESETS: { label: string; day: MarketDay }[] = [
  { label: 'Whole market sells off', day: { market: -0.035, sector: -0.035, stock: -0.035, volumeRatio: 1.5 } },
  { label: 'IT sector sells off', day: { market: 0, sector: -0.04, stock: -0.04, volumeRatio: 1.5 } },
  { label: 'Only this stock falls', day: { market: 0, sector: 0, stock: -0.04, volumeRatio: 2 } },
  { label: 'Same fall, thin volume', day: { market: 0, sector: 0, stock: -0.04, volumeRatio: 0.3 } },
];

function MarketDrill() {
  const [day, setDay] = useState<MarketDay>(MARKET_PRESETS[0]!.day);
  const result = useMemo(() => simulateMarketDay(day), [day]);
  const set = (key: keyof MarketDay) => (v: number) => setDay((d) => ({ ...d, [key]: key === 'volumeRatio' ? v : v / 100 }));

  return (
    <Drill
      title="The market sells off"
      summary={`Most red days aren't about your stock. Ledger subtracts what the market and the stock's own group did, and only flags what's left — if volume backs it up. Move the sliders for a made-up ${SIM_CLUSTER_LABEL} stock.`}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
        {MARKET_PRESETS.map((p) => (
          <button key={p.label} onClick={() => setDay(p.day)} style={pillStyle(JSON.stringify(p.day) === JSON.stringify(day))}>
            {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 24px' }}>
        <Slider label="Market (Nifty)" value={day.market * 100} display={signedPct(day.market)} min={-6} max={6} step={0.1} onChange={set('market')} />
        <Slider label={`${SIM_CLUSTER_LABEL} sector`} value={day.sector * 100} display={signedPct(day.sector)} min={-6} max={6} step={0.1} onChange={set('sector')} />
        <Slider label={SIM_SYMBOL} value={day.stock * 100} display={signedPct(day.stock)} min={-8} max={8} step={0.1} onChange={set('stock')} />
        <Slider label="Volume" value={day.volumeRatio} display={`${day.volumeRatio.toFixed(1)}x normal`} min={0.1} max={4} step={0.1} onChange={set('volumeRatio')} />
      </div>
      <ResultLabel>What the digest shows</ResultLabel>
      <Outcome result={result} />
    </Drill>
  );
}

// --- 2. bad price from feed B ----------------------------------------------

function FeedDrill() {
  const [offsetPct, setOffsetPct] = useState(3);
  const r = useMemo(() => simulateFeedDisagreement(offsetPct / 100), [offsetPct]);
  const unconfirmed = r.result.outcome === 'unconfirmed';

  return (
    <Drill
      title="A feed sends a bad price"
      summary={`Every price is checked against a second source. If they differ by more than ${(r.tolerance * 100).toFixed(0)}%, the price is stored and labeled, but never used to raise an alert. Today ${SIM_SYMBOL} rose ${signedPct(FEED_DRILL_DAY.stock)} on ${FEED_DRILL_DAY.volumeRatio}x volume — normally enough to flag.`}
    >
      <Slider label="Feed B is off by" value={offsetPct} display={`${offsetPct.toFixed(1)}%`} min={0} max={10} step={0.1} onChange={setOffsetPct} />
      <p className="tabular" style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '12px 0 0' }}>
        Feed A {rupees(r.feedA)} · Feed B {rupees(r.feedB)} · differ by {((r.result.reconciled.disagreementPct ?? 0) * 100).toFixed(2)}% (limit{' '}
        {(r.tolerance * 100).toFixed(0)}%) ·{' '}
        <span style={{ fontWeight: 600, color: unconfirmed ? 'var(--down)' : 'var(--up)' }}>{unconfirmed ? 'unconfirmed' : 'confirmed'}</span>
      </p>
      <ResultLabel>What Ledger does</ResultLabel>
      {unconfirmed ? (
        <>
          <DataQualityNotice quality="invalid" asOf={new Date(`${r.result.sessionDate}T03:45:00.000Z`)} now={new Date(`${r.result.sessionDate}T11:30:00.000Z`)} />
          <Quiet>No alert raised. Had the feeds agreed, this is the card it would have shown:</Quiet>
          <div style={{ opacity: 0.45, marginTop: 10 }} aria-hidden="true">
            <Outcome result={r.withoutConflict} />
          </div>
        </>
      ) : (
        <Outcome result={r.result} />
      )}
    </Drill>
  );
}

// --- 3. feed goes quiet -----------------------------------------------------

const QUALITY_LABEL: Record<QuoteQuality, string> = {
  fresh: 'Fresh',
  stale: 'Stale',
  unavailable: 'Unavailable',
  invalid: 'Invalid',
};

function StaleDrill() {
  const [sessions, setSessions] = useState(2);
  const r = useMemo(() => simulateStaleness(sessions), [sessions]);
  const fmt = (d: Date) =>
    d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  return (
    <Drill
      title="A feed goes quiet"
      summary="Prices arrive once a day, after the close. Freshness is counted in trading sessions — nights, weekends and the not-yet-run evening update don't count against it."
    >
      <Slider
        label="Sessions closed with no new price"
        value={sessions}
        display={String(sessions)}
        min={0}
        max={6}
        step={1}
        onChange={setSessions}
      />
      <p className="tabular" style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: '10px 0 0' }}>
        Last price: {fmt(r.asOf)} bar · checked {fmt(r.now)} IST
      </p>
      <ResultLabel>What the watchlist and stock page show</ResultLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 12 }}>
        <HeartbeatDot quality={r.quality} />
        <span style={{ fontWeight: 600 }}>{SIM_SYMBOL}</span>
        <span style={{ color: 'var(--ink-muted)' }}>{QUALITY_LABEL[r.quality]}</span>
      </div>
      {r.quality === 'fresh' ? <Quiet>No notice — the price is as current as a daily feed can be.</Quiet> : <DataQualityNotice quality={r.quality} asOf={r.asOf} now={r.now} />}
    </Drill>
  );
}

// --- 4. slow or failing feed ----------------------------------------------

const POLL_INTERVAL_MS = 1000;
const MAX_LOG_LINES = 8;

function SlowFeedDrill() {
  const [latencyMs, setLatencyMs] = useState(2500);
  const [feedDown, setFeedDown] = useState(false);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ completed: 0, skipped: 0, errors: 0 });
  const [log, setLog] = useState<string[]>([]);
  const latencyRef = useRef(latencyMs);
  const feedDownRef = useRef(feedDown);
  const runnerRef = useRef<IntervalRunner | null>(null);
  const startedAtRef = useRef(0);

  latencyRef.current = latencyMs;
  feedDownRef.current = feedDown;

  useEffect(() => () => runnerRef.current?.stop(), []);

  function append(line: string) {
    const t = ((Date.now() - startedAtRef.current) / 1000).toFixed(1).padStart(5, ' ');
    setLog((l) => [...l, `${t}s  ${line}`].slice(-MAX_LOG_LINES));
  }

  function start() {
    setStats({ completed: 0, skipped: 0, errors: 0 });
    setLog([]);
    startedAtRef.current = Date.now();
    // The worker's real runner and the same log lines worker/loop.ts prints.
    const label = `${SIM_SYMBOL}(hot)`;
    const runner = new IntervalRunner({
      label,
      intervalMs: POLL_INTERVAL_MS,
      task: async () => {
        await new Promise((resolve) => setTimeout(resolve, latencyRef.current));
        if (feedDownRef.current) throw new Error('fetch failed: connection refused');
        setStats((s) => ({ ...s, completed: s.completed + 1 }));
        append(`${label}: fetched in ${latencyRef.current}ms`);
      },
      onSkip: (l, skipped) => {
        setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
        append(`${l}: still busy, skipped tick #${skipped}`);
      },
      onCaughtUp: (l, total) => append(`${l}: caught up after skipping ${total} tick(s)`),
      onError: (l, err) => {
        setStats((s) => ({ ...s, errors: s.errors + 1 }));
        append(`${l}: ingestion error: ${(err as Error).message}`);
      },
    });
    runnerRef.current = runner;
    runner.start();
    setRunning(true);
  }

  function stop() {
    runnerRef.current?.stop();
    runnerRef.current = null;
    setRunning(false);
  }

  return (
    <Drill
      title="A feed is slow, or down"
      summary={`This runs the live worker's actual polling loop in your browser, polling every ${POLL_INTERVAL_MS / 1000}s against a pretend feed. A slow fetch never piles up a second one behind it — the tick is skipped and logged — and a failing fetch is logged without stopping the loop.`}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px 24px', alignItems: 'end' }}>
        <Slider label="Feed response time" value={latencyMs} display={`${latencyMs}ms`} min={0} max={3500} step={100} onChange={setLatencyMs} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFeedDown((d) => !d)} style={pillStyle(feedDown)} aria-pressed={feedDown}>
            {feedDown ? 'Feed down' : 'Take feed down'}
          </button>
          <button onClick={running ? stop : start} style={pillStyle(running)}>
            {running ? 'Stop polling' : 'Start polling'}
          </button>
        </div>
      </div>
      <p className="tabular" style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '14px 0 8px' }}>
        {stats.completed} fetched · {stats.skipped} ticks skipped · {stats.errors} errors · never more than 1 fetch at a time
      </p>
      <div style={{ overflowX: 'auto' }}>
        <pre
          className="tabular"
          style={{
            margin: 0,
            minHeight: `${MAX_LOG_LINES * 1.6}em`,
            padding: '10px 12px',
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11.5,
            lineHeight: 1.6,
            color: 'var(--ink-muted)',
          }}
        >
          {log.length > 0 ? log.join('\n') : running ? 'Polling…' : 'Press Start polling.'}
        </pre>
      </div>
    </Drill>
  );
}

// --- 5. stock split ---------------------------------------------------------

function SplitDrill() {
  const [phase, setPhase] = useState<SplitPhase>('ex-date');
  const r = useMemo(() => simulateSplit(phase), [phase]);

  return (
    <Drill
      title="A stock splits"
      summary={`After a 1:${SPLIT_RATIO} split every share is worth a fifth as much, so the raw price drops ${signedPct(-(1 - 1 / SPLIT_RATIO), 0)} overnight without anyone losing money. Ledger rescales the history before comparing anything.`}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button onClick={() => setPhase('ex-date')} style={pillStyle(phase === 'ex-date')}>
          Split day
        </button>
        <button onClick={() => setPhase('next-session')} style={pillStyle(phase === 'next-session')}>
          Next day: a real 4% fall
        </button>
      </div>
      <p className="tabular" style={{ fontSize: 13, color: 'var(--ink-muted)', margin: '12px 0 0' }}>
        Raw price change today: {signedPct(r.rawChange)}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 20px' }}>
        <div>
          <ResultLabel>Ledger</ResultLabel>
          <Outcome result={r.withAdjustment} />
        </div>
        <div>
          <ResultLabel>If the split were ignored</ResultLabel>
          <Outcome result={r.withoutAdjustment} />
        </div>
      </div>
      {phase === 'next-session' && (
        <p style={{ fontSize: 12.5, color: 'var(--ink-faint)', margin: '12px 0 0', lineHeight: 1.5 }}>
          Ignoring the split doesn&rsquo;t just cause one false alarm: the fake {signedPct(-(1 - 1 / SPLIT_RATIO), 0)} day stays in the
          stock&rsquo;s history and makes a genuine move look normal for months.
        </p>
      )}
    </Drill>
  );
}

export function FailureDrills() {
  return (
    <SimpleDetailProvider>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <SimpleDetailToggle />
      </div>
      <MarketDrill />
      <FeedDrill />
      <StaleDrill />
      <SlowFeedDrill />
      <SplitDrill />
    </SimpleDetailProvider>
  );
}
