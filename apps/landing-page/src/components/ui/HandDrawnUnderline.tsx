"use client";

import { motion, useReducedMotion } from "framer-motion";

/** A single hand-drawn underline stroke that draws in once, tied to the Caveat annotation motif. */
export function HandDrawnUnderline({
  delay = 0,
  className = "",
}: {
  delay?: number;
  className?: string;
}): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();

  return (
    <svg
      viewBox="0 0 160 14"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute -bottom-2 left-0 h-3 w-full ${className}`}
      aria-hidden="true"
    >
      <motion.path
        d="M2 8.5C24 4.5 48 4 72 6.5C98 9.2 126 9.8 158 5"
        fill="none"
        stroke="var(--focus)"
        strokeWidth="3"
        strokeLinecap="round"
        initial={prefersReducedMotion ? false : { pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: prefersReducedMotion ? 0.2 : 0.7, delay: prefersReducedMotion ? 0 : delay, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}
