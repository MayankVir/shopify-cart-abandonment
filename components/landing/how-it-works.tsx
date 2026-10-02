"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Phone, Plug, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  {
    title: "Connect your Shopify",
    body: "Link the store. Carts left at checkout and deliveries on the way come from there.",
    imageLight: "/landing/how-shopify-light.jpg",
    imageDark: "/landing/how-shopify.jpg",
    alt: "Custello connected to a Shopify store",
    icon: Store,
  },
  {
    title: "Connect checkout",
    body: "GoKwik, Shipflo, Shiprocket, or Shopify checkout directly. The call knows what was left behind.",
    imageLight: "/landing/how-checkout-light.jpg",
    imageDark: "/landing/how-checkout.jpg",
    alt: "Checkout choices: GoKwik, Shipflo, Shiprocket, and Shopify checkout",
    icon: Plug,
  },
  {
    title: "Sync and start the calls",
    body: "Once the store is in sync, Custello starts calling. No list to upload.",
    imageLight: "/landing/how-sync-light.jpg",
    imageDark: "/landing/how-sync.jpg",
    alt: "Custello in sync, with calls starting for a cart and a delivery",
    icon: Phone,
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
        <div className="mx-auto max-w-2xl space-y-4 pb-6 text-center">
          <p className="font-mono text-sm font-medium uppercase tracking-wider text-primary">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl md:text-5xl">
            Connect the store. Then the calls start.
          </h2>
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <ol className="hidden lg:block">
            {steps.map((item, index) => {
              const selected = index === active;
              const Icon = item.icon;
              return (
                <li key={item.title} className="relative mb-8 last:mb-0">
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 top-0 w-0.5 overflow-hidden rounded-full bg-border"
                  >
                    {selected ? (
                      <motion.span
                        key={active}
                        className="absolute left-0 top-0 w-full bg-primary"
                        initial={reduce ? { height: "100%" } : { height: "0%" }}
                        animate={{ height: "100%" }}
                        transition={
                          reduce
                            ? { duration: 0 }
                            : { duration: STEP_MS / 1000, ease: "linear" }
                        }
                      />
                    ) : null}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    aria-current={selected ? "step" : undefined}
                    className="flex w-full items-start text-left"
                  >
                    <span className="mx-5 flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 pt-1">
                      <span className="block text-xl font-semibold text-foreground">
                        {index + 1}. {item.title}
                      </span>
                      <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                        {item.body}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg">
            <AnimatePresence mode="wait">
              <motion.div
                key={step.title}
                className="relative h-full w-full"
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -12 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <Image
                  src={step.imageLight}
                  alt={step.alt}
                  fill
                  sizes="(min-width: 1024px) 520px, 100vw"
                  className="rounded-lg object-contain object-center dark:hidden"
                />
                <Image
                  src={step.imageDark}
                  alt={step.alt}
                  fill
                  sizes="(min-width: 1024px) 520px, 100vw"
                  className="hidden rounded-lg object-contain object-center dark:block"
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <ul className="flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
            {steps.map((item, index) => {
              const selected = index === active;
              return (
                <li key={item.title} className="w-[min(16rem,75%)] shrink-0 snap-center">
                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    aria-current={selected ? "step" : undefined}
                    className="relative block h-full w-full pt-4 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute left-0 right-0 top-0 h-0.5 overflow-hidden rounded-full bg-border"
                    >
                      {selected ? (
                        <motion.span
                          key={`mobile-${active}`}
                          className="absolute left-0 top-0 h-full bg-primary"
                          initial={reduce ? { width: "100%" } : { width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={
                            reduce
                              ? { duration: 0 }
                              : { duration: STEP_MS / 1000, ease: "linear" }
                          }
                        />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "block text-lg font-semibold",
                        selected ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {index + 1}. {item.title}
                    </span>
                    <span className="mt-2 block text-sm leading-relaxed text-muted-foreground">
                      {item.body}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
