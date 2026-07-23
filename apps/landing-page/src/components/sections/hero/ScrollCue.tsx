export function ScrollCue(): React.JSX.Element {
  return (
    <a
      href="#product"
      aria-label="Scroll to the next section"
      className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-paper/40 transition-colors duration-150 ease hover:text-paper/80 lg:flex lg:flex-col"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Scroll</span>
      <svg
        width="14"
        height="20"
        viewBox="0 0 14 20"
        fill="none"
        aria-hidden="true"
        className="scroll-cue"
      >
        <path d="M1 1 7 19 13 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
