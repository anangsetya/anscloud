/**
 * AnsCloud logo — monochrome glass cloud with letter "A" inside.
 * Sized via `className` (e.g., "h-9 w-9" or "h-12 w-12").
 */
export function AnsCloudLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="anscloud-glass" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#94A3B8" />
          <stop offset="100%" stopColor="#64748B" />
        </linearGradient>
      </defs>
      {/* Cloud shape — symmetrical */}
      <path
        d="M18 44 C10 44 6 38 6 32 C6 26 11 22 16 22 C17 14 24 9 32 9 C40 9 47 14 48 22 C54 22 58 27 58 32 C58 38 53 44 46 44 Z"
        fill="url(#anscloud-glass)"
      />
      {/* Letter A (white, geometric, centered) */}
      <path
        d="M32 21 L25.5 38 L29 38 L30.4 33.5 L33.6 33.5 L35 38 L38.5 38 Z M30.9 31 L32 27.5 L33.1 31 Z"
        fill="#ffffff"
      />
      {/* Subtle storage line */}
      <rect x="21" y="40" width="22" height="1.2" rx="0.6" fill="#ffffff" opacity="0.4" />
    </svg>
  );
}
