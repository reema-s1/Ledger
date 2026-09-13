interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Indices into `values` where a real significant event was flagged (item 18) — drawn as small dots, never fabricated from raw price alone. */
  eventIndices?: number[];
  /** Index matching the user's stored read-cursor position (item 18) — drawn as a dotted vertical line. */
  cursorIndex?: number;
  /**
   * Whether the move since `cursorIndex` actually cleared the significance
   * bar — colors the post-cursor segment by this, not by raw sign, so a
   * small insignificant dip/rise since the user last looked doesn't render
   * as alarming (item 18's explicit requirement). Ignored if cursorIndex
   * is unset.
   */
  significantSinceCursor?: boolean;
}

function pointsFor(values: number[], indices: number[], stepX: number, min: number, range: number, height: number): string {
  return indices
    .map((i) => {
      const v = values[i]!;
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** A plain inline-SVG line, drawn to the data's own scale. No chart library — this is the whole thing. */
export function Sparkline({ values, width = 200, height = 48, eventIndices = [], cursorIndex, significantSinceCursor }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const last = values[values.length - 1]!;
  const first = values[0]!;
  const baseColor = last >= first ? 'var(--up)' : 'var(--down)';

  const hasCursor = cursorIndex !== undefined && cursorIndex >= 0 && cursorIndex < values.length;
  const preIndices = hasCursor ? Array.from({ length: cursorIndex! + 1 }, (_, i) => i) : values.map((_, i) => i);
  const postIndices = hasCursor ? Array.from({ length: values.length - cursorIndex! }, (_, i) => i + cursorIndex!) : [];

  const postColor = significantSinceCursor
    ? values[values.length - 1]! >= values[cursorIndex ?? 0]!
      ? 'var(--up)'
      : 'var(--down)'
    : 'var(--ink-faint)';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent price trend">
      <polyline
        points={pointsFor(values, preIndices, stepX, min, range, height)}
        fill="none"
        stroke={hasCursor ? 'var(--ink-faint)' : baseColor}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {hasCursor && postIndices.length > 1 && (
        <polyline
          points={pointsFor(values, postIndices, stepX, min, range, height)}
          fill="none"
          stroke={postColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {hasCursor && (
        <line
          x1={cursorIndex! * stepX}
          y1={0}
          x2={cursorIndex! * stepX}
          y2={height}
          stroke="var(--ink-faint)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      )}
      {eventIndices.map((i) => {
        if (i < 0 || i >= values.length) return null;
        const x = i * stepX;
        const y = height - ((values[i]! - min) / range) * height;
        return <circle key={i} cx={x} cy={y} r={2.25} fill="var(--accent-blue)" />;
      })}
    </svg>
  );
}
