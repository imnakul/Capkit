import { performanceStats, principles } from "@/lib/content";
import { Kicker } from "@/components/ui/Kicker";
import { Reveal } from "@/components/ui/Reveal";

export function PerformanceSection(): React.JSX.Element {
  return (
    <section id="performance" className="bg-panel py-24 sm:py-32">
      <div className="mx-auto max-w-[1600px] px-6 sm:px-10">
        <Reveal>
          <Kicker index="04" label="Light while idle" />
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="mt-6 max-w-2xl font-sans text-[32px] font-light leading-[1.15] tracking-tight sm:text-[42px]">
            Fast while active. Nearly invisible while idle.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden rounded-[20px] border border-line-on-light bg-line-on-light sm:grid-cols-2 lg:grid-cols-4">
          {performanceStats.map((stat, i) => (
            <Reveal key={stat.label} delay={0.05 * i} className="bg-panel p-8">
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-[38px] font-medium leading-none tracking-tight sm:text-[44px]">
                  {stat.value}
                </span>
              </div>
              <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.1em] text-ink/45">
                {stat.unit}
              </span>
              <p className="mt-4 font-sans text-[14.5px] font-light leading-snug text-ink/70">
                {stat.label}
              </p>
            </Reveal>
          ))}
        </div>

        <div className="mt-20 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((principle, i) => (
            <Reveal key={principle.title} delay={0.04 * i} className="border-l-2 border-ink/15 pl-5">
              <h3 className="font-sans text-[16px] font-semibold tracking-tight">
                {principle.title}
              </h3>
              <p className="mt-1.5 font-sans text-[14px] font-light leading-relaxed text-ink/60">
                {principle.body}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
