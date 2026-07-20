import Link from "next/link";
import { footerLinks, site } from "@/lib/content";
import { Logomark } from "@/components/layout/Logomark";

export function SiteFooter(): React.JSX.Element {
  const year = 2026;

  return (
    <footer className="border-t border-line-on-dark bg-ink text-paper">
      <div className="mx-auto max-w-[1600px] px-6 py-16 sm:px-10">
        <div className="grid gap-12 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <Logomark className="h-7 w-7" />
              <span className="font-sans text-[17px] font-semibold">{site.name}</span>
            </div>
            <p className="mt-4 max-w-xs font-sans text-[14px] font-light leading-relaxed text-paper/55">
              {site.description}
            </p>
          </div>

          <nav aria-label="Product">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/40">
              Product
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-sans text-[14px] text-paper/75 transition-colors duration-150 hover:text-focus"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Project">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/40">
              Project
            </h3>
            <ul className="mt-4 space-y-3">
              {footerLinks.project.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="font-sans text-[14px] text-paper/75 transition-colors duration-150 hover:text-focus"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-3 border-t border-line-on-dark pt-8 font-mono text-[11px] uppercase tracking-[0.08em] text-paper/35 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} {site.name}. Windows 11 confirmed, more platforms in progress.</span>
          <span>Built local-first. No account required.</span>
        </div>
      </div>
    </footer>
  );
}
