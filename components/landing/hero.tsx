import Link from "next/link";
import { HeroDashboard } from "@/components/landing/hero-dashboard";
import { AnimatedGridPattern } from "@/components/ui/animated-grid-pattern";

export function Hero() {
  return (
    <section className="relative -mt-16 w-full">
      <AnimatedGridPattern
        numSquares={28}
        maxOpacity={0.12}
        duration={3}
        width={48}
        height={48}
        className="fill-primary/10 stroke-primary/15 text-primary dark:fill-primary/25 dark:stroke-primary/20 [mask-image:radial-gradient(ellipse_at_center,black_15%,transparent_72%)]"
      />
      <div className="relative z-10 mx-auto flex w-full max-w-[100rem] flex-col items-center px-6 pb-4 pt-24 md:px-10 md:pt-28 lg:px-14">
        <h1
          className="mb-6 max-w-3xl px-6 text-center text-4xl font-medium md:text-5xl lg:text-6xl"
          style={{ lineHeight: 1.35 }}
        >
          <span className="block pb-1 text-foreground">Recover lost revenue.</span>
          <span className="block pb-1 text-muted-foreground">The agent makes the call.</span>
        </h1>

        <p className="mb-10 max-w-xl px-6 text-center text-sm text-muted-foreground md:text-base">
          Calls for abandoned carts and deliveries that would otherwise return.
        </p>

        <div className="relative z-10 mb-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/sign-in"
            className="inline-flex h-12 items-center justify-center rounded-lg bg-primary px-8 text-base font-medium text-primary-foreground shadow-[0_0_40px_-12px_hsl(var(--primary))] transition-all hover:scale-105 hover:bg-primary/90 active:scale-95"
          >
            Start trial
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-background px-8 text-base font-medium text-foreground shadow-sm shadow-black/[0.04] transition-all hover:bg-muted active:scale-95 dark:border-white/15 dark:bg-white/5 dark:shadow-none dark:hover:bg-white/10"
          >
            How it works
          </a>
        </div>
        <p className="mb-10 text-center text-xs text-muted-foreground">
          14-day free trial. No credit card required.
        </p>

        <HeroDashboard />
      </div>
    </section>
  );
}
