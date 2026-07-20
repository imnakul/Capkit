import Link from "next/link";
import { nav, site } from "@/lib/content";
import { Button } from "@/components/ui/Button";
import { Logomark } from "@/components/layout/Logomark";

export function SiteNav(): React.JSX.Element {
  return (
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-paper/85 backdrop-blur-md">
      <nav
        className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-6 sm:px-10"
        aria-label="Primary"
      >
        <Link href="#top" className="flex items-center gap-2.5" aria-label={`${site.name} home`}>
          <Logomark className="h-7 w-7 text-ink" />
          <span className="font-sans text-[17px] font-semibold tracking-tight">{site.name}</span>
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="font-mono text-[12px] uppercase tracking-[0.1em] text-ink/60 transition-colors duration-150 hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <Button as="a" href="#cta" variant="secondary" className="!px-5 !py-2.5 text-[12px]">
          Get notified
        </Button>
      </nav>
    </header>
  );
}
