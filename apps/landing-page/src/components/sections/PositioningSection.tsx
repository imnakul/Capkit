import { positioning } from "@/lib/content";
import { Kicker } from "@/components/ui/Kicker";
import { Reveal } from "@/components/ui/Reveal";
import { GhostNumeral } from "@/components/ui/GhostNumeral";

export function PositioningSection(): React.JSX.Element {
  return (
    <section id="product" className="relative overflow-hidden bg-paper py-24 sm:py-32">
      <GhostNumeral index="02" />
      <div className="relative z-[1] mx-auto max-w-[1600px] px-6 sm:px-10">
        <Reveal>
          <Kicker index="02" label="Where CapKit fits" />
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="mt-6 max-w-2xl font-sans text-[32px] font-light leading-[1.15] tracking-tight sm:text-[42px]">
            Between the built-in snip that does too little, and the suite that
            asks for too much attention.
          </h2>
        </Reveal>

        <div className="mt-16 divide-y divide-line-on-light border-t border-line-on-light">
          {positioning.map((row, i) => (
            <Reveal key={row.tool} delay={0.04 * i}>
              <div className="group grid gap-3 py-8 sm:grid-cols-[240px_1fr] sm:items-baseline sm:gap-8">
                <span className="font-mono text-[13px] uppercase tracking-[0.1em] text-ink/45 transition-colors duration-150 ease group-hover:text-focus">
                  {row.tool}
                </span>
                <p className="max-w-2xl font-sans text-[19px] font-light leading-relaxed sm:text-[22px]">
                  {row.compare}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
