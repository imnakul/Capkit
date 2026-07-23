import { Kicker } from "@/components/ui/Kicker";
import { Reveal } from "@/components/ui/Reveal";
import { Button } from "@/components/ui/Button";
import { GhostNumeral } from "@/components/ui/GhostNumeral";
import { HandDrawnUnderline } from "@/components/ui/HandDrawnUnderline";
import { EmailCaptureForm } from "@/components/sections/cta/EmailCaptureForm";

export function CTASection(): React.JSX.Element {
  return (
    <section id="cta" className="relative overflow-hidden bg-paper py-24 sm:py-32">
      <GhostNumeral index="06" />
      <div className="relative z-[1] mx-auto max-w-[1600px] px-6 sm:px-10">
        <Reveal>
          <Kicker index="06" label="Join the beta" />
        </Reveal>

        <Reveal delay={0.06}>
          <h2 className="mt-6 max-w-2xl font-sans text-[38px] font-light leading-[1.08] tracking-tight sm:text-[54px]">
            Capture, explain,
            <br />
            and{" "}
            <span className="relative inline-block">
              <span className="font-hand text-focus">continue</span>
              <HandDrawnUnderline delay={0.5} />
            </span>
            .
          </h2>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-6 max-w-md font-sans text-[16px] font-light leading-relaxed text-ink/60">
            Windows 11 first. Local-first by default. No account, no cloud
            dependency, and sharing stays an explicit later action.
          </p>
        </Reveal>

        <Reveal delay={0.18} className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-center">
          <EmailCaptureForm />
          <Button as="a" href="#" variant="secondary">
            View source
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
