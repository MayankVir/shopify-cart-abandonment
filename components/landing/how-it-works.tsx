"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/landing/reveal";

const steps = [
  {
    title: "Something is at risk",
    body: "A shopper leaves checkout, or a delivery looks likely to come back. Custello picks it up without a manual list.",
  },
  {
    title: "A natural call goes out",
    body: "The agent speaks like a store associate. It can offer a discount, answer a question, or confirm where to deliver.",
    quote:
      "“You left a few items in your cart. I can hold them and apply a discount if you want to finish today.”",
  },
  {
    title: "The order is saved",
    body: "A recovered cart is sent back to checkout. A confirmed delivery stays on the truck instead of returning to you.",
  },
];

const STEP_MS = 5000;

export function HowItWorks() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const step = steps[active];

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setActive((current) => (current + 1) % steps.length);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [active, reduce]);

  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 border-t border-border px-4 py-16 md:py-28"
    >
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
              How Custello works
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              One voice agent for carts left behind and deliveries that would
              otherwise return.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col gap-2">
            {steps.map((item, index) => {
              const selected = index === active;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setActive(index)}
                  className="relative rounded-2xl px-4 py-4 text-left transition-colors hover:bg-muted/50"
                >
                  {selected ? (
                    <motion.span
                      layoutId="how-step"
                      className="absolute inset-0 rounded-2xl bg-muted"
                      transition={{ type: "spring", stiffness: 320, damping: 32 }}
                    />
                  ) : null}
                  <span className="relative block">
                    <span className="mb-3 block h-0.5 overflow-hidden rounded-full bg-border">
                      {selected && !reduce ? (
                        <motion.span
                          key={active}
                          className="block h-full bg-primary"
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                        />
                      ) : null}
                    </span>
                    <span className="text-lg font-semibold text-foreground">
                      {item.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative min-h-[360px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm shadow-black/[0.04] dark:shadow-none">
            <div className="relative aspect-[4/3]">
              <Image
                src="/landing/pack-station.jpg"
                alt="Merchant packing a folded garment into a shipping box"
                fill
                sizes="(min-width: 1024px) 480px, 100vw"
                className="object-cover"
              />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={step.title}
                initial={reduce ? false : { y: 10 }}
                animate={{ y: 0 }}
                exit={reduce ? undefined : { y: -8 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="p-6"
              >
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                {step.quote ? (
                  <p className="mt-4 text-base leading-relaxed text-foreground">
                    {step.quote}
                  </p>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
