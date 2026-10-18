import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { RuleLabel } from "@/components/ui";

export default function NotFound() {
  return (
    <section className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <div className="mx-auto w-fit animate-pop">
          <LogoMark size={96} tile />
        </div>
        <h1 className="mt-8 text-[clamp(4rem,14vw,9rem)] leading-[0.85] font-black uppercase">
          <span className="mask-line">
            <span className="block animate-rise text-ink">Four</span>
          </span>
          <span className="mask-line">
            <span className="text-outline block animate-rise [animation-delay:120ms]">oh four</span>
          </span>
        </h1>
        <RuleLabel className="mx-auto mt-8 w-fit text-left">This pipe leads nowhere</RuleLabel>
        <Link
          href="/"
          className="shine label group mt-8 inline-flex items-center gap-3 bg-ink px-6 py-3.5 text-[11px] text-ivory transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:bg-ink-deep"
        >
          Back home <span className="text-coral transition-transform duration-300 group-hover:translate-x-1">→</span>
        </Link>
      </div>
    </section>
  );
}
