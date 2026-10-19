"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { openPalette } from "./CommandPalette";
import { AccountMenu } from "./AccountMenu";
import { TOOLS } from "@/lib/tools";

const READY = TOOLS.filter((t) => t.ready);

/** Desktop: a few direct links plus the Tools menu. Mobile: everything. */
const PRIMARY = [
  { href: "/", label: "Home" },
  { href: "/workspace", label: "Data Model" },
  { href: "/docs", label: "Docs" },
  { href: "/author", label: "Author" },
];
const MOBILE = [{ href: "/", label: "Home" }, ...READY.map((t) => ({ href: t.href, label: t.nav ?? t.title })), { href: "/docs", label: "Docs" }, { href: "/author", label: "Author" }];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

export function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolActive = READY.some((t) => isActive(pathname, t.href));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // close the mobile menu when the route changes or Escape is pressed
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header
        className={`sticky top-0 z-40 transition-all duration-500 ease-out-expo ${
          scrolled ? "border-b border-line/70 bg-ivory/85 py-3 backdrop-blur-md" : "py-5"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:gap-6 md:px-8">
          <Link href="/" aria-label="Pipewright home" className="animate-fade-in" onClick={() => setOpen(false)}>
            <Logo compact />
          </Link>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
            {PRIMARY.slice(0, 1).map((item, i) => (
              <NavLink key={item.href} href={item.href} label={item.label} active={isActive(pathname, item.href)} delay={80 + i * 50} />
            ))}
            {/* Tools menu: every tool with a one-line description */}
            <div className="relative" onMouseEnter={() => setToolsOpen(true)} onMouseLeave={() => setToolsOpen(false)}>
              <button
                onClick={() => setToolsOpen((o) => !o)}
                aria-expanded={toolsOpen}
                aria-haspopup="true"
                style={{ animationDelay: "130ms" }}
                className={`label group relative flex animate-fade-in items-center gap-1.5 pb-1.5 transition-colors ${toolActive ? "text-ink" : "text-text/70 hover:text-ink"}`}
              >
                Tools
                <svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true" className={`transition-transform duration-300 ${toolsOpen ? "rotate-180" : ""}`}>
                  <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                <Dot active={toolActive} />
              </button>
              <div
                className={`absolute top-full left-1/2 w-[640px] -translate-x-1/2 pt-3 transition-all duration-300 ease-out-expo ${
                  toolsOpen ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
                }`}
              >
                <div className="paper grid grid-cols-2 gap-1 border border-line p-2 shadow-xl">
                  {READY.map((t, i) => (
                    <Link
                      key={t.href}
                      href={t.href}
                      onClick={() => setToolsOpen(false)}
                      tabIndex={toolsOpen ? 0 : -1}
                      style={{ transitionDelay: toolsOpen ? `${i * 25}ms` : "0ms" }}
                      className={`flood group/item flex gap-3 p-3 transition-all duration-300 [--flood:var(--color-ink)] ${toolsOpen ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"}`}
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center border border-line text-ink transition-colors group-hover/item:border-ivory/30 group-hover/item:text-coral">{t.icon}</span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold transition-colors group-hover/item:text-ivory ${isActive(pathname, t.href) ? "text-coral-deep" : "text-ink"}`}>{t.title}</span>
                        <span className="line-clamp-2 block text-xs text-muted transition-colors group-hover/item:text-ivory/70">{t.blurb}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            {PRIMARY.slice(1).map((item, i) => (
              <NavLink key={item.href} href={item.href} label={item.label} active={isActive(pathname, item.href)} delay={180 + i * 50} />
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* on phones search lives in the menu, so the bar fits */}
          <button
            onClick={openPalette}
            aria-label="Search (Ctrl K)"
            className="group hidden h-10 animate-fade-in sm:flex items-center gap-2 rounded-full border border-line px-3 text-muted transition-all duration-500 ease-out-expo [animation-delay:450ms] hover:border-coral hover:text-coral"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="transition-transform duration-500 ease-spring group-hover:-rotate-12 group-hover:scale-110">
              <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className="label hidden xl:inline">Search</span>
            <kbd className="label hidden border border-line px-1 text-[9px] sm:inline">⌘K</kbd>
          </button>
          <ThemeToggle className="animate-fade-in [animation-delay:500ms]" />
          <AccountMenu />
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="group relative z-50 grid h-10 w-10 place-items-center lg:hidden"
          >
            <span className={`absolute h-0.5 w-6 bg-ink transition-all duration-500 ease-out-expo ${open ? "rotate-45" : "-translate-y-1.5"}`} />
            <span className={`absolute h-0.5 w-6 bg-ink transition-all duration-300 ${open ? "scale-x-0 opacity-0" : ""}`} />
            <span className={`absolute h-0.5 w-6 bg-ink transition-all duration-500 ease-out-expo ${open ? "-rotate-45" : "translate-y-1.5"}`} />
          </button>
          </div>
        </div>
      </header>

      {/* mobile menu: full-screen, giant links rising in */}
      <div
        className={`paper-blue fixed inset-0 z-30 flex flex-col justify-center overflow-y-auto px-6 pt-24 pb-10 transition-[clip-path] duration-700 ease-out-expo lg:hidden ${
          open ? "[clip-path:circle(150%_at_100%_0)]" : "pointer-events-none [clip-path:circle(0%_at_100%_0)]"
        }`}
      >
        <div
          className={`mb-8 transition-all delay-100 duration-700 ease-out-expo ${open ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`}
        >
          <LogoMark size={56} tile />
        </div>
        <nav className="space-y-1" aria-label="Mobile">
          {MOBILE.map((item, i) => (
            <span key={item.href} className="mask-line">
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                style={{ transitionDelay: open ? `${150 + i * 45}ms` : "0ms" }}
                className={`font-wide block text-3xl font-black uppercase transition-transform duration-700 ease-out-expo sm:text-4xl ${
                  open ? "translate-y-0" : "translate-y-full"
                } ${isActive(pathname, item.href) ? "text-coral" : "text-outline-paper hover:text-cream"}`}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
        <button
          onClick={() => {
            setOpen(false);
            openPalette();
          }}
          tabIndex={open ? 0 : -1}
          className={`mt-8 flex items-center gap-3 self-start rounded-full border border-cream/40 px-5 py-3 text-sm font-semibold text-cream transition-all delay-300 duration-700 ease-out-expo active:scale-95 ${
            open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="text-coral">
            <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
            <path d="M15.5 15.5 21 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          Search tools &amp; docs
        </button>
        <p className="label mt-10 text-cream/60">Your junior data engineer</p>
      </div>
    </>
  );
}

function Dot({ active }: { active: boolean }) {
  // the BLOOM dot under the active item; hovering grows a line
  return (
    <span
      className={`absolute -bottom-0.5 left-1/2 h-1 -translate-x-1/2 rounded-full bg-coral transition-all duration-500 ease-out-expo ${
        active ? "w-1 opacity-100" : "w-0 opacity-0 group-hover:h-px group-hover:w-full group-hover:opacity-100"
      }`}
    />
  );
}

function NavLink({ href, label, active, delay }: { href: string; label: string; active: boolean; delay: number }) {
  return (
    <Link
      href={href}
      style={{ animationDelay: `${delay}ms` }}
      className={`label group relative animate-fade-in pb-1.5 transition-colors ${active ? "text-ink" : "text-text/70 hover:text-ink"}`}
    >
      {label}
      <Dot active={active} />
    </Link>
  );
}
