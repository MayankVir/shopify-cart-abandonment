"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Reveal } from "@/components/landing/reveal";
import { onAccentCtaClass, secondaryCtaClass } from "@/components/landing/styles";

const regions = {
  IN: {
    label: "India",
    prices: ["₹4,999", "₹9,999", "₹19,999"] as const,
  },
  OTHER: {
    label: "Outside India",
    prices: ["Custom", "Custom", "Custom"] as const,
  },
} as const;

type RegionId = keyof typeof regions;

const plans = [
  {
    name: "Starter",
    body: "For a store trying voice on one problem.",
    features: [
      "Cart recovery or RTO calling",
      "Human-like voice",
      "Live call analytics",
      "Email support",
    ],
    popular: false,
  },
  {
    name: "Pro",
    body: "Cart recovery and RTO, with checkout connected.",
    features: [
      "Cart recovery and RTO",
      "GoKwik and checkout",
      "Full live analytics",
      "Priority support",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    body: "For brands that want the call written around their catalog.",
    features: [
      "Everything in Pro",
      "Custom call scripts",
      "Dedicated manager",
      "Hands-on onboarding",
    ],
    popular: false,
  },
];

export function Pricing() {
  const [region, setRegion] = useState<RegionId>("IN");
  const prices = regions[region].prices;

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-border px-4 py-16 md:py-28">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
              Pricing for your country
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              India is priced in rupees. Other countries are quoted for the
              same plans.
            </p>
            <div className="mx-auto mt-8 inline-flex rounded-full border border-border bg-muted p-1 shadow-sm shadow-black/[0.04] dark:shadow-none">
              {(Object.entries(regions) as [RegionId, (typeof regions)[RegionId]][]).map(
                ([id, item]) => {
                  const selected = region === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setRegion(id)}
                      className="relative rounded-full px-4 py-2 text-sm font-medium"
                    >
                      {selected ? (
                        <motion.span
                          layoutId="pricing-region"
                          className="absolute inset-0 rounded-full bg-primary"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      ) : null}
                      <span
                        className={`relative ${selected ? "text-primary-foreground" : "text-muted-foreground"}`}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid items-stretch gap-4 md:grid-cols-3">
          {plans.map((plan, index) => {
            const amount = prices[index];
            const cta = amount === "Custom" ? "Contact sales" : "Start trial";
            return (
              <article
                key={plan.name}
                className={
                  plan.popular
                    ? "flex flex-col rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm shadow-primary/20 dark:shadow-none md:p-8"
                    : "flex flex-col rounded-2xl border border-border bg-card p-6 text-foreground shadow-sm shadow-black/[0.04] dark:shadow-none md:p-8"
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold">{plan.name}</h3>
                  {plan.popular ? (
                    <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-medium">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p
                  className={
                    plan.popular
                      ? "mt-2 text-sm text-primary-foreground/80"
                      : "mt-2 text-sm text-muted-foreground"
                  }
                >
                  {plan.body}
                </p>
                <p className="mt-6 text-4xl font-semibold tracking-tight">
                  {amount}
                  {amount !== "Custom" ? (
                    <span className="text-base font-medium opacity-70">/mo</span>
                  ) : null}
                </p>
                <Link
                  href="/sign-in"
                  className={
                    plan.popular
                      ? `${onAccentCtaClass} mt-6`
                      : `${secondaryCtaClass} mt-6 w-full`
                  }
                >
                  {cta}
                </Link>
                <ul className="mt-6 space-y-2.5 border-t border-current/10 pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
                      <span className={plan.popular ? "text-primary-foreground/90" : "text-muted-foreground"}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
