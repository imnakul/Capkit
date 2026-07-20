import type { Metadata } from "next";
import { jakarta, jetbrainsMono, caveat } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snaphub — Capture, explain, and continue.",
  description:
    "A lightweight, always-available screenshot and visual communication utility for Windows. Frozen-screen capture, real annotation, and secure redaction — without opening another app.",
  metadataBase: new URL("https://snaphub.app"),
  openGraph: {
    title: "Snaphub — Capture, explain, and continue.",
    description:
      "The useful tools missing from system snipping, exactly where you need them. Fast while active, nearly invisible while idle.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${jetbrainsMono.variable} ${caveat.variable} h-full`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
