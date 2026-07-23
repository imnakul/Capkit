"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "span";
};

const variants: Variants = {
  hidden: { opacity: 0, transform: "translateY(16px)" },
  visible: { opacity: 1, transform: "translateY(0px)" },
};

const reducedVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export function Reveal({ children, delay = 0, className, as = "div" }: RevealProps): React.JSX.Element {
  const MotionComponent = as === "span" ? motion.span : motion.div;
  const prefersReducedMotion = useReducedMotion();

  return (
    <MotionComponent
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={prefersReducedMotion ? reducedVariants : variants}
      transition={{ duration: prefersReducedMotion ? 0.2 : 0.6, delay: prefersReducedMotion ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </MotionComponent>
  );
}
