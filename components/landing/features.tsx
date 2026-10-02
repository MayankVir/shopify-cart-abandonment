"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { NumberTicker } from "@/components/landing/number-ticker";
import { FlickeringGrid } from "@/components/ui/flickering-grid";
import { cn } from "@/lib/utils";

const ease = [0.16, 1, 0.3, 1] as const;

function FeatureCard({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.article
      className={cn(
        "group relative flex flex-col items-start overflow-hidden rounded-2xl bg-card p-6 transition-colors duration-500 ease-out hover:bg-primary/10",
        className
      )}
      initial={reduce ? false : { opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease }}
    >
      {children}
    </motion.article>
  );
}

function WindowMock({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background shadow-[0_0_28px_rgba(0,0,0,0.28)]",
        className
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="h-2 w-2 rounded-full bg-muted-foreground/30" />
        <span className="ml-2 h-4 flex-1 rounded-md bg-muted/80" />
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Fade({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bottom-0 left-0 h-16 w-full bg-gradient-to-t from-background to-transparent",
        className
      )}
    />
  );
}

function VoiceBars() {
  const heights = [0.45, 0.7, 1, 0.55, 0.85, 0.4, 0.75, 0.5];

  return (
    <div className="flex h-8 items-end gap-1" aria-hidden="true">
      {heights.map((height, index) => (
        <span
          key={index}
          className="w-1 origin-bottom rounded-full bg-primary motion-safe:animate-voice-bar"
          style={{
            height: `${height * 100}%`,
            animationDelay: `${index * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

function Ripple() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -bottom-full [mask-image:linear-gradient(to_bottom,white,transparent)]"
    >
      {Array.from({ length: 8 }, (_, index) => {
        const size = 140 + index * 70;
        return (
          <span
            key={index}
            className="absolute left-1/2 top-1/2 rounded-full border border-primary/20 bg-primary/10 motion-safe:animate-ripple"
            style={{
              width: size,
              height: size,
              opacity: Math.max(0.08, 0.28 - index * 0.03),
              ["--i" as string]: index,
            }}
          />
        );
      })}
    </div>
  );
}

export function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-24 border-t border-border bg-background px-4 py-16 md:py-28"
    >
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-2xl space-y-4 pb-6 text-center">
          <p className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            Features
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Bring the order home.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            A call when someone leaves checkout. A call when a delivery would
            come back. You see which orders were saved.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-sm grid-cols-1 gap-6 text-foreground md:max-w-3xl md:grid-cols-2 md:grid-rows-3 xl:max-w-6xl xl:auto-rows-fr xl:grid-cols-3 xl:grid-rows-2">
          <FeatureCard className="min-h-[22rem]">
            <div>
              <h3 className="mb-2 font-semibold text-primary">
                Abandoned cart recovery
              </h3>
              <p>
                A shopper leaves checkout. Custello picks it up without a
                manual list, calls, and helps them finish the order.
              </p>
            </div>
            <div className="-mb-8 mt-auto w-full px-2 pt-6 transition-transform duration-300 ease-out group-hover:-translate-y-2.5">
              <WindowMock>
                <p className="text-xs text-muted-foreground">Left checkout</p>
                <p className="mt-1 text-sm font-medium">Aisha · 4 min ago</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <VoiceBars />
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
                    Calling
                  </span>
                </div>
              </WindowMock>
            </div>
            <Fade />
          </FeatureCard>

          <FeatureCard delay={0.08} className="order-3 min-h-[22rem] xl:order-none">
            <div>
              <h3 className="mb-2 font-semibold text-primary">RTO reduction</h3>
              <p>
                When a delivery looks likely to come back, Custello calls to
                confirm the address and keep the shipment on the truck.
              </p>
            </div>
            <div className="-mb-8 mt-auto w-full px-2 pt-6 transition-transform duration-300 ease-out group-hover:-translate-y-2.5">
              <WindowMock>
                <p className="text-xs text-muted-foreground">Delivery check</p>
                <p className="mt-1 text-sm font-medium">Rohan · out for delivery</p>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Address</span>
                    <span className="text-foreground">Confirmed</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full w-4/5 rounded-full bg-primary" />
                  </div>
                </div>
              </WindowMock>
            </div>
            <Fade />
          </FeatureCard>

          <FeatureCard delay={0.12} className="md:row-span-2">
            <FlickeringGrid
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]"
              squareSize={3}
              gridGap={5}
              color="hsl(var(--primary))"
              maxOpacity={0.35}
              flickerChance={0.2}
            />
            <div className="relative">
              <h3 className="mb-2 font-semibold text-primary">The order is saved</h3>
              <p>
                A recovered cart goes back to checkout. A confirmed delivery
                stays out for delivery. You see both as they happen.
              </p>
            </div>
            <div className="relative -mb-10 ml-10 mt-auto w-full pt-8 transition-transform duration-300 ease-out group-hover:-translate-x-2.5">
              <WindowMock>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight">
                  <NumberTicker value={800} suffix="+" />
                </p>
                <p className="text-xs text-muted-foreground">Carts recovered</p>
                <svg
                  viewBox="0 0 240 64"
                  className="mt-4 w-full text-primary"
                  aria-hidden="true"
                >
                  <path
                    d="M0 46 C 28 46, 36 18, 68 26 S 112 54, 148 22 S 196 8, 240 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    pathLength="1"
                    strokeDasharray="1"
                    className="motion-safe:animate-line-draw"
                  />
                </svg>
              </WindowMock>
            </div>
            <Fade />
          </FeatureCard>

          <FeatureCard delay={0.16} className="order-4 md:col-span-2 xl:order-none">
            <Ripple />
            <div className="relative">
              <h3 className="mb-2 font-semibold text-primary">
                A natural call goes out
              </h3>
              <p>
                The agent speaks like a store associate. It can offer a
                discount, answer a question, or confirm where to deliver.
                WhatsApp and email follow-up is on the way.
              </p>
            </div>
            <div className="relative -mb-8 mt-auto w-full px-2 pt-6 transition-transform duration-300 ease-out group-hover:-translate-y-2.5">
              <WindowMock>
                <div className="space-y-2">
                  <p className="max-w-[16rem] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm">
                    You left a few items in your cart. I can hold them.
                  </p>
                  <p className="ml-auto max-w-[14rem] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                    Can you place it for me?
                  </p>
                  <p className="max-w-[16rem] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm">
                    Done. The order is in.
                  </p>
                </div>
              </WindowMock>
            </div>
            <Fade />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}
