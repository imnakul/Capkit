import { heroStats, site } from "@/lib/content";
import { Button } from "@/components/ui/Button";
import { Kicker } from "@/components/ui/Kicker";
import { Reveal } from "@/components/ui/Reveal";
import { CaptureVisual } from "@/components/sections/hero/CaptureVisual";
import { ScrollCue } from "@/components/sections/hero/ScrollCue";

export function HeroSection(): React.JSX.Element {
  return (
    <section id="top" className="bg-noise relative overflow-hidden bg-ink text-paper">
      <div className="absolute inset-0 bg-grid opacity-40" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-[1600px] gap-14 px-6 pb-20 pt-16 sm:px-10 sm:pb-28 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10">
        <div>
          <Reveal>
            <Kicker index="01" label="Frozen-screen capture" tone="dark" />
          </Reveal>

          <Reveal delay={0.08}>
            <h1 className="mt-7 max-w-xl font-sans text-[44px] font-light leading-[1.05] tracking-tight sm:text-[58px] lg:text-[64px]">
              Capture, explain,
              <br />
              and <span className="font-medium text-focus">continue</span>.
            </h1>
          </Reveal>

          <Reveal delay={0.16}>
            <p className="mt-6 max-w-md font-sans text-[17px] font-light leading-relaxed text-paper/65 sm:text-[19px]">
              {site.description}
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Button as="a" href="#cta" variant="primary">
                Get notified for Windows
              </Button>
              <Button as="a" href="#tools" variant="ghost-dark">
                See the tools
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.32}>
            <dl className="mt-14 grid max-w-md grid-cols-3 gap-6 border-t border-line-on-dark pt-6">
              {heroStats.map((stat) => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="font-mono text-[20px] font-medium text-paper sm:text-[24px]">
                    {stat.value}
                  </dd>
                  <p className="mt-1 font-sans text-[12px] leading-snug text-paper/45">
                    {stat.label}
                  </p>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="lg:pl-4">
          <CaptureVisual />
        </Reveal>
      </div>

      <ScrollCue />
    </section>
  );
}
