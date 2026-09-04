interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

/** A plain inline-SVG line, drawn to the data's own scale. No chart library — this is the whole thing. */
export function Sparkline({ values, width = 200, height = 48 }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const last = values[values.length - 1]!;
  const first = values[0]!;
  const color = last >= first ? 'var(--up)' : 'var(--down)';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent price trend">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
