import Link from "next/link";
import { BorderBeam, Magnetic, PointerGlow } from "@/components/landing/motion";
import { primaryCtaClass } from "@/components/landing/styles";

export function CtaBanner() {
  return (
    <section className="px-4 py-16 md:py-24">
      <PointerGlow className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-primary/[0.06] to-card px-6 py-16 text-center shadow-sm shadow-black/[0.04] dark:from-card dark:to-card dark:shadow-none md:py-24">
        <BorderBeam size={180} duration={10} borderWidth={1.5} />
        <h2 className="relative mx-auto max-w-[16ch] text-3xl font-semibold tracking-tight text-foreground md:text-5xl md:leading-[1.08]">
          Ready to stop losing sales?
        </h2>
        <p className="relative mx-auto mt-4 max-w-[42ch] text-base leading-relaxed text-muted-foreground">
          Custello calls for abandoned carts and for deliveries that would otherwise come back.
        </p>
        <div className="relative mt-8 flex flex-col items-center">
          <Magnetic>
            <Link href="/sign-in" className={primaryCtaClass}>
              Start trial
            </Link>
          </Magnetic>
          <p className="mt-3 text-sm text-muted-foreground">
            14-day trial. No credit card required.
          </p>
        </div>
      </PointerGlow>
    </section>
  );
}
