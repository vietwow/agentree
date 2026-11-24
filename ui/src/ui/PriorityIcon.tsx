/** A priority as signal bars: P1 fills three, P2 two, P3 and below one. */
const LOOK = [
  { bars: 3, color: "text-(--priority-1)" },
  { bars: 2, color: "text-(--priority-2)" },
  { bars: 1, color: "text-(--priority-3)" },
];

export function PriorityIcon({ priority }: { priority: number }) {
  const look = LOOK[Math.min(priority, LOOK.length) - 1] ?? LOOK[2]!;
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" role="img" aria-label={`Priority ${priority}`} className={`shrink-0 ${look.color}`}>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1.5 + i * 4}
          y={9 - i * 3}
          width="3"
          height={3.5 + i * 3}
          rx="0.75"
          fill="currentColor"
          opacity={i < look.bars ? 1 : 0.25}
          className="icon-part bar-grow"
          style={{ animationDelay: `${i * 70}ms` }}
        />
      ))}
    </svg>
  );
}
