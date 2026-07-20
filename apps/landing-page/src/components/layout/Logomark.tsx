export function Logomark({ className = "" }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="30" height="30" rx="8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 12V9h3M23 12V9h-3M9 20v3h3M23 20v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="4.5" fill="var(--focus)" />
    </svg>
  );
}
