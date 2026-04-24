/**
 * Dependency-free SVG sparkline for the shareable card. Deliberately not
 * using Recharts — Recharts wants a client boundary, measures DOM on
 * mount, and adds ~80KB for a chart that just needs one <path>.
 *
 * Takes a raw price series (in time order) and paints a smoothed line
 * scaled to fit. The fill beneath the line is a gradient so the card
 * reads as "chart-y" at a glance in a social preview.
 */

interface SparklineProps {
  values: number[];
  positive?: boolean;
  width?: number;
  height?: number;
}

export function ShareSparkline({
  values,
  positive = true,
  width = 600,
  height = 140,
}: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padY = 8;
  const drawH = height - padY * 2;

  const stepX = width / (values.length - 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = padY + drawH - ((v - min) / range) * drawH;
    return { x, y };
  });

  // Catmull-Rom-ish smoothed path. Overkill for a sparkline? Yes. But
  // it's what separates a nice card from an obviously-auto-generated
  // one in a screenshot.
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const midX = (p0.x + p1.x) / 2;
    d += ` Q ${midX},${p0.y} ${midX},${(p0.y + p1.y) / 2}`;
    d += ` Q ${midX},${p1.y} ${p1.x},${p1.y}`;
  }

  const areaD = `${d} L ${width},${height} L 0,${height} Z`;
  const stroke = positive ? "#a78bfa" : "#f87171";
  const fill = positive
    ? "url(#spark-fill-positive)"
    : "url(#spark-fill-negative)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="spark-fill-positive" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="spark-fill-negative" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f87171" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={fill} />
      <path d={d} stroke={stroke} strokeWidth="2" fill="none" />
      {/* End cap — subtle dot on the latest price. */}
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="3.5"
        fill={stroke}
      />
    </svg>
  );
}
