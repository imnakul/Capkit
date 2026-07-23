"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DesktopBackdrop } from "@/components/sections/hero/DesktopBackdrop";
import { CornerMarks } from "@/components/ui/CornerMarks";
import { CoordinateTag } from "@/components/ui/CoordinateTag";
import { ToolIcon, type IconName } from "@/components/sections/hero/ToolIcon";

const tools: IconName[] = ["arrow", "blur", "text", "counter", "pin"];

export function CaptureVisual(): React.JSX.Element {
  const prefersReducedMotion = useReducedMotion();
  const settled = Boolean(prefersReducedMotion);

  return (
    <div className="relative aspect-[4/3] w-full cursor-crosshair sm:aspect-[16/11]">
      <div className="relative h-full w-full rounded-[28px] border border-white/10 bg-black p-2 sm:p-3">
        <DesktopBackdrop />

        {/* the selection: overlaid on the faux browser window, bottom-right */}
        <motion.div
          className="absolute bottom-[9%] right-[6%] h-[46%] w-[42%]"
          initial={settled ? false : { opacity: 0, transform: "scale(0.92)" }}
          animate={{ opacity: 1, transform: "scale(1)" }}
          transition={{ duration: 0.7, delay: settled ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="marching-ants absolute inset-0 rounded-[2px]" />
          <CornerMarks color="var(--focus)" />

          <CoordinateTag className="absolute -top-8 left-0">424, 180</CoordinateTag>
          <CoordinateTag className="absolute -bottom-8 right-0">960 × 540</CoordinateTag>

          {/* counter badge */}
          <span className="absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full bg-focus font-mono text-[11px] font-semibold text-paper">
            1
          </span>

          {/* floating toolbar */}
          <motion.div
            className="absolute left-full top-1/2 ml-3 flex flex-col gap-1 rounded-full border border-white/15 bg-[#111111]/95 p-1.5"
            style={{ transform: "translateY(-50%)" }}
            initial={settled ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: settled ? 0 : 1.05, ease: [0.16, 1, 0.3, 1] }}
          >
            {tools.map((tool, i) => (
              <span
                key={tool}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-paper/80 transition-colors duration-150 ease-out ${
                  i === 1 ? "bg-focus text-paper" : ""
                }`}
              >
                <ToolIcon name={tool} />
              </span>
            ))}
          </motion.div>

          {/* handwritten annotation */}
          <motion.span
            className="absolute -left-6 top-[110%] font-hand text-[22px] leading-none text-paper/90 sm:text-[26px]"
            initial={settled ? false : { opacity: 0, transform: "translateY(-6px)" }}
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            transition={{ duration: 0.5, delay: settled ? 0 : 1.4 }}
          >
            redact this →
          </motion.span>
        </motion.div>
      </div>
    </div>
  );
}
