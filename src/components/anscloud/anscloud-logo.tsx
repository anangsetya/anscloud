/**
 * AnsCloud logo — cloud shape with letter "A" inside, emerald-teal gradient.
 * Used in sidebar brand, login page, and other places that show the brand.
 *
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
        <linearGradient id="anscloud-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      {/* Cloud shape */}
      <path
        d="M20 44 C12 44 8 38 8 32 C8 26 13 22 18 22 C19 14 26 10 32 10 C40 10 46 16 47 23 C53 23 56 28 56 33 C56 39 51 44 45 44 Z"
        fill="url(#anscloud-brand-grad)"
      />
      {/* Letter A (white, geometric) */}
      <path
        d="M32 22 L26 38 L29 38 L30.2 34.5 L33.8 34.5 L35 38 L38 38 Z M31 31.5 L32 28 L33 31.5 Z"
        fill="#ffffff"
      />
      {/* Storage layer line below A */}
      <rect x="22" y="40" width="20" height="1.5" rx="0.75" fill="#ffffff" opacity="0.6" />
    </svg>
  );
}
