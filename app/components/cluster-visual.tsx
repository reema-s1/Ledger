export interface ClusterVisualGroup {
  id: string;
  label: string;
  members: string[];
}

interface ClusterVisualProps {
  groups: ClusterVisualGroup[];
  /** symbol -> 'structural_break' | 'residual_move', for nodes to drift outward and color semantically. */
  moved: Map<string, string>;
  width?: number;
}

/**
 * "One small visual. Nodes in loose groups, the breaking node drifting
 * out." Hand-built inline SVG, deterministic layout, no chart library —
 * this is the whole visual.
 *
 * Every member draws a spoke back to its group's center — a faint,
 * uniform one by default (plain "this belongs to this hub," the standard
 * hub-and-spoke reading), replaced with a bold, colored one only for a
 * symbol that's actually moved recently. Previously only moved symbols
 * got a spoke at all, which read as an unexplained inconsistency rather
 * than a signal — now the spoke is always there, and only its color/
 * weight carries information.
 *
 * Every node is a real link to its symbol page (a plain SVG `<a>`, which
 * every mainstream browser has supported natively for over a decade) —
 * previously the diagram was hover-only with no way to click through.
 *
 * Hover interactivity is plain CSS (`.cluster-hover-zoom`/
 * `.cluster-node-hover` in globals.css) — no JS state, no animation
 * library: `transform-box: fill-box` lets each group/node scale around
 * its own visual center instead of the SVG's (0,0) origin, and a wider
 * invisible hit-circle behind each group means hovering the empty space
 * inside the dashed ring (not just a stroke line or a dot) still
 * triggers it.
 */
export function ClusterVisual({ groups, moved, width = 632 }: ClusterVisualProps) {
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(groups.length))));
  const rows = Math.ceil(groups.length / columns);
  const cellW = width / columns;
  const cellH = 190;
  const height = rows * cellH;
  const baseRadius = Math.min(cellW, cellH) * 0.3;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cluster groupings">
      {groups.map((group, gi) => {
        const col = gi % columns;
        const row = Math.floor(gi / columns);
        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2 + 6;
        const n = group.members.length;

        return (
          <g
            key={group.id}
            // Only the first group is targeted, not the whole SVG — with
            // enough real clusters this grid runs taller than the
            // viewport, and driver.js positions its popover relative to
            // whatever it highlights (see the watchlist table header and
            // the divergence list's first group for the same fix).
            data-tour={gi === 0 ? 'cluster-visual' : undefined}
            className="cluster-hover-zoom"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          >
            {/* Invisible, generously-sized hit area so hovering anywhere in
                the group's cell — not just a drawn line or dot — triggers
                the zoom. Drawn first so everything else layers on top. */}
            <circle cx={cx} cy={cy} r={baseRadius + 40} fill="transparent" stroke="none" />
            <circle cx={cx} cy={cy} r={baseRadius + 14} fill="none" stroke="var(--rule)" strokeWidth="1" strokeDasharray="2 4" />
            <text
              x={cx}
              y={row * cellH + 22}
              textAnchor="middle"
              fontFamily="var(--font-sans)"
              fontSize="11"
              fontWeight={500}
              letterSpacing="0.06em"
              fill="var(--ink-faint)"
              style={{ textTransform: 'uppercase' }}
            >
              {group.label}
            </text>

            {group.members.map((symbol, mi) => {
              const angle = (mi / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
              const kind = moved.get(symbol);
              const isBreak = kind === 'structural_break';
              const isMove = kind === 'residual_move';
              const drift = isBreak ? 1.75 : isMove ? 1.3 : 0.85;
              const r = baseRadius * drift;
              const x = cx + Math.cos(angle) * r;
              const y = cy + Math.sin(angle) * r;
              const dotColor = isBreak ? 'var(--down)' : isMove ? 'var(--unconfirmed)' : 'var(--accent)';
              const dotRadius = isBreak ? 5 : isMove ? 4 : 3;

              return (
                <a key={symbol} href={`/symbol/${symbol}`}>
                  <g className="cluster-node-hover" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
                    {/* Always-present, faint spoke — "this dot belongs to this hub." */}
                    <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--rule)" strokeWidth="0.75" />
                    {/* Overdrawn, bold, colored spoke only for a symbol that actually moved. */}
                    {(isBreak || isMove) && (
                      <line x1={cx} y1={cy} x2={x} y2={y} stroke={dotColor} strokeWidth="1.25" opacity="0.55" />
                    )}
                    {/* A little invisible padding around the dot itself, same reason as the group's hit circle. */}
                    <circle cx={x} cy={y} r={dotRadius + 6} fill="transparent" stroke="none" />
                    <circle cx={x} cy={y} r={dotRadius} fill={dotColor}>
                      <title>{symbol} — open symbol page</title>
                    </circle>
                    <text
                      x={x}
                      y={y + dotRadius + 11}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize="9"
                      fill="var(--ink-muted)"
                    >
                      {symbol}
                    </text>
                  </g>
                </a>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
