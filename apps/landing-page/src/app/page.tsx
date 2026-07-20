import { SiteNav } from "@/components/layout/SiteNav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { HeroSection } from "@/components/sections/HeroSection";
import { PositioningSection } from "@/components/sections/PositioningSection";
import { QuickToolsSection } from "@/components/sections/QuickToolsSection";
import { PerformanceSection } from "@/components/sections/PerformanceSection";
import { PlatformSection } from "@/components/sections/PlatformSection";
import { CTASection } from "@/components/sections/CTASection";

export default function Home(): React.JSX.Element {
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        <HeroSection />
        <PositioningSection />
        <QuickToolsSection />
        <PerformanceSection />
        <PlatformSection />
        <CTASection />
      </main>
      <SiteFooter />
    </>
  );
}
