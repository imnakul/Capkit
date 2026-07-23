import { platforms } from "@/lib/content";
import { Kicker } from "@/components/ui/Kicker";
import { Reveal } from "@/components/ui/Reveal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { GhostNumeral } from "@/components/ui/GhostNumeral";

export function PlatformSection(): React.JSX.Element {
  return (
    <section id="platforms" className="bg-noise relative overflow-hidden bg-ink py-24 text-paper sm:py-32">
      <GhostNumeral index="05" tone="dark" />
      <div className="relative z-[1] mx-auto max-w-[1600px] px-6 sm:px-10">
        <Reveal>
          <Kicker index="05" label="Platform status" tone="dark" />
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="mt-6 max-w-2xl font-sans text-[32px] font-light leading-[1.15] tracking-tight sm:text-[42px]">
            Platform truth over false sameness.
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mt-5 max-w-lg font-sans text-[15px] font-light leading-relaxed text-paper/55">
            We explain OS permission or compositor limitations instead of silently
            failing. Here&rsquo;s exactly what&rsquo;s real today, and what&rsquo;s next.
          </p>
        </Reveal>

        <div className="mt-16 divide-y divide-line-on-dark border-t border-line-on-dark">
          {platforms.map((platform, i) => (
            <Reveal key={platform.name} delay={0.05 * i}>
              <div className="grid gap-4 py-7 sm:grid-cols-[200px_140px_1fr] sm:items-center">
                <span className="font-sans text-[20px] font-medium tracking-tight">
                  {platform.name}
                </span>
                <StatusBadge status={platform.status} />
                <p className="font-sans text-[14.5px] font-light text-paper/50">
                  {platform.note}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
