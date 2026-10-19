import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Archivo, Geist, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import { TopNav } from "@/components/TopNav";
import { CommandPalette } from "@/components/CommandPalette";
import { AiSettingsDialog } from "@/components/AiSettingsDialog";
import { Cursor, ScrollProgress } from "@/components/Cursor";
import { author } from "@/lib/author";
import { Logo } from "@/components/Logo";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

/** The phone browser's bar matches the page (the theme script switches it for dark mode). */
export const viewport: Viewport = {
  themeColor: "#eae6de",
};

export const metadata: Metadata = {
  title: { default: "Pipewright", template: "%s · Pipewright" },
  description: "Your junior data engineer: schemas, data models, SQL and docs, drafted for review.",
  authors: [{ name: author.name }],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${archivo.variable} ${instrument.variable} ${geist.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <head>
        {/* sets the saved/system theme before first paint, so there's no light flash in dark mode */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <ScrollProgress />
        <Cursor />
        <TopNav />
        <CommandPalette />
        <AiSettingsDialog />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-16 md:px-8 md:pt-10">{children}</main>
        <footer className="overflow-hidden border-t border-line/70">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-6 px-4 pt-10 pb-4 md:px-8">
            <Link href="/" aria-label="Pipewright home">
              <Logo size={40} tagline />
            </Link>
            <div className="flex flex-wrap items-center gap-6">
              <Link href="/docs" className="label link-grow text-ink">
                Docs
              </Link>
              <Link href="/author" className="label link-grow text-ink">
                Built by {author.name}
              </Link>
            </div>
          </div>
          {/* oversized outline wordmark bleeding off the bottom edge */}
          <p aria-hidden="true" className="font-wide outline-fill mx-auto -mb-[0.22em] max-w-7xl px-4 text-center text-[9.4vw] leading-none font-black uppercase select-none md:px-8 xl:text-[7.4rem]">
            Pipewright
          </p>
        </footer>
      </body>
    </html>
  );
}
