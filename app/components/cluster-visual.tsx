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
          <g key={group.id}>
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
                <g key={symbol}>
                  {(isBreak || isMove) && (
                    <line x1={cx} y1={cy} x2={x} y2={y} stroke={dotColor} strokeWidth="0.75" opacity="0.35" />
                  )}
                  <circle cx={x} cy={y} r={dotRadius} fill={dotColor}>
                    <title>{symbol}</title>
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
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
