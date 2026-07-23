import { quickTools } from "@/lib/content";
import { Kicker } from "@/components/ui/Kicker";
import { Reveal } from "@/components/ui/Reveal";
import { GhostNumeral } from "@/components/ui/GhostNumeral";
import { ToolIcon, type IconName } from "@/components/sections/hero/ToolIcon";

const toolIcons: Record<string, IconName> = {
  redact: "blur",
  annotate: "arrow",
  counter: "counter",
  pin: "pin",
  scroll: "text",
};

export function QuickToolsSection(): React.JSX.Element {
  return (
    <section id="tools" className="bg-noise relative overflow-hidden bg-ink py-24 text-paper sm:py-32">
      <GhostNumeral index="03" tone="dark" />
      <div className="relative z-[1] mx-auto max-w-[1600px] px-6 sm:px-10">
        <Reveal>
          <Kicker index="03" label="Quick tools" tone="dark" />
        </Reveal>

        <div className="mt-6 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <Reveal delay={0.06}>
            <h2 className="max-w-xl font-sans text-[32px] font-light leading-[1.15] tracking-tight sm:text-[42px]">
              Depth on demand, never in the way.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-sm font-sans text-[15px] font-light leading-relaxed text-paper/55">
              Contextual controls appear only after you choose a tool. Everything else stays out of sight.
            </p>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-[20px] border border-line-on-dark bg-line-on-dark sm:grid-cols-2 lg:grid-cols-3">
          {quickTools.map((tool, i) => (
            <Reveal
              key={tool.id}
              delay={0.05 * i}
              className={`group bg-ink p-8 transition-colors duration-150 ease hover:bg-[#0d0d0d] ${i === 0 ? "lg:col-span-2" : ""}`}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line-on-dark text-paper/70 transition-colors duration-150 ease group-hover:border-focus/50 group-hover:text-focus">
                <ToolIcon name={toolIcons[tool.id]} />
              </span>
              <span className="mt-5 block font-mono text-[11px] uppercase tracking-[0.14em] text-focus">
                {tool.mono}
              </span>
              <h3 className="mt-4 font-sans text-[21px] font-medium tracking-tight">
                {tool.title}
              </h3>
              <p className="mt-3 max-w-sm font-sans text-[14.5px] font-light leading-relaxed text-paper/55">
                {tool.description}
              </p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
