"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo, LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { TOOLS } from "@/lib/tools";

const NAV = [
  { href: "/", label: "Home" },
  ...TOOLS.filter((t) => t.ready).map((t) => ({ href: t.href, label: t.nav ?? t.title })),
  { href: "/author", label: "Author" },
];

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

export function TopNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 md:px-8">
          <Link href="/" aria-label="Pipewright home" className="animate-fade-in" onClick={() => setOpen(false)}>
            <Logo />
          </Link>

          <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
            {NAV.map((item, i) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ animationDelay: `${80 + i * 50}ms` }}
                  className={`label group relative animate-fade-in pb-1.5 transition-colors ${active ? "text-ink" : "text-text/70 hover:text-ink"}`}
                >
                  {item.label}
                  {/* the BLOOM dot under the active item; hovering grows a line */}
                  <span
                    className={`absolute -bottom-0.5 left-1/2 h-1 -translate-x-1/2 rounded-full bg-coral transition-all duration-500 ease-out-expo ${
                      active ? "w-1 opacity-100" : "w-0 opacity-0 group-hover:w-full group-hover:opacity-100 group-hover:h-px"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
          <ThemeToggle className="animate-fade-in [animation-delay:500ms]" />
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
        className={`paper-blue fixed inset-0 z-30 flex flex-col justify-center px-6 transition-[clip-path] duration-700 ease-out-expo lg:hidden ${
          open ? "[clip-path:circle(150%_at_100%_0)]" : "pointer-events-none [clip-path:circle(0%_at_100%_0)]"
        }`}
      >
        <div
          className={`mb-8 transition-all delay-100 duration-700 ease-out-expo ${open ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"}`}
        >
          <LogoMark size={56} tile />
        </div>
        <nav className="space-y-1" aria-label="Mobile">
          {NAV.map((item, i) => (
            <span key={item.href} className="mask-line">
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                tabIndex={open ? 0 : -1}
                style={{ transitionDelay: open ? `${150 + i * 60}ms` : "0ms" }}
                className={`font-wide block text-4xl font-black uppercase transition-transform duration-700 ease-out-expo sm:text-5xl ${
                  open ? "translate-y-0" : "translate-y-full"
                } ${isActive(pathname, item.href) ? "text-coral" : "text-outline-paper hover:text-cream"}`}
              >
                {item.label}
              </Link>
            </span>
          ))}
        </nav>
        <p className="label mt-10 text-cream/60">Your junior data engineer</p>
      </div>
    </>
  );
}
