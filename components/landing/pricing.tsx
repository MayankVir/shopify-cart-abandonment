"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { onAccentCtaClass, secondaryCtaClass } from "@/components/landing/styles";
import {
  currencyForCountry,
  currencyFromTimeZone,
  formatBillingMoney,
  type BillingCurrency,
} from "@/lib/billing/currency";
import { YEARLY_DISCOUNT, fullYearlyPriceInr, listPlans, yearlyPriceInr, type PlanId } from "@/lib/billing/plans";

type Interval = "monthly" | "yearly";

const intervals: { id: Interval; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

const plans = listPlans();

export function Pricing() {
  const [interval, setInterval] = useState<Interval>("monthly");
  const [currency, setCurrency] = useState<BillingCurrency>("USD");

  useEffect(() => {
    const local = currencyFromTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setCurrency(local);

    let active = true;
    fetch("/api/geo")
      .then((response) => response.json())
      .then((data: { country?: string | null }) => {
        if (!active || !data.country) return;
        setCurrency(currencyForCountry(data.country));
      })
      .catch(() => {
        if (active) setCurrency(local);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section id="pricing" className="scroll-mt-24 border-t border-border px-4 py-16 md:py-28">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Pricing for your country
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Prices shown in {currency}. Each plan includes talk time, then a
            per-minute rate after that.
          </p>
          <div className="mx-auto mt-8 inline-flex rounded-full border border-border bg-muted p-1 shadow-sm shadow-black/[0.04] dark:shadow-none">
            {intervals.map((item) => {
              const selected = interval === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setInterval(item.id)}
                  className="relative rounded-full px-4 py-2 text-sm font-medium"
                >
                  {selected ? (
                    <motion.span
                      layoutId="pricing-interval"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  ) : null}
                  <span
                    className={`relative inline-flex items-center gap-1.5 ${selected ? "text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {item.label}
                    {item.id === "yearly" ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                          selected
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-primary/15 text-primary"
                        }`}
                      >
                        {Math.round(YEARLY_DISCOUNT * 100)}%
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-12 grid items-stretch gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const popular = plan.id === "growth";
            const amountInr = interval === "yearly" ? yearlyPriceInr(plan.priceInr) : plan.priceInr;
            const amount = formatBillingMoney(amountInr, currency);
            const compareAt =
              interval === "yearly" ? formatBillingMoney(fullYearlyPriceInr(plan.priceInr), currency) : null;
            const overage = formatBillingMoney(plan.overageRatePerMin, currency, currency === "INR" ? 0 : 2);
            const pointers = [
              `${plan.includedMinutes.toLocaleString("en-IN")} minutes included`,
              `${overage} per extra minute`,
              ...plan.features,
            ];

            return (
              <PlanCard
                key={plan.id}
                name={plan.name}
                planId={plan.id}
                popular={popular}
                amount={amount}
                compareAt={compareAt}
                interval={interval}
                pointers={pointers}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PlanCard({
  name,
  planId,
  popular,
  amount,
  compareAt,
  interval,
  pointers,
}: {
  name: string;
  planId: PlanId;
  popular: boolean;
  amount: string;
  compareAt: string | null;
  interval: Interval;
  pointers: string[];
}) {
  const body =
    planId === "starter"
      ? "For a store starting with checkout recovery."
      : planId === "growth"
        ? "Discounts on the call, with checkout connected."
        : "COD, failed deliveries, and a voice for the brand.";

  return (
    <article
      className={
        popular
          ? "flex flex-col rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm shadow-primary/20 dark:shadow-none md:p-8"
          : "flex flex-col rounded-2xl border border-border bg-card p-6 text-foreground shadow-sm shadow-black/[0.04] dark:shadow-none md:p-8"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">{name}</h3>
        {popular ? (
          <span className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-xs font-medium">
            Most popular
          </span>
        ) : null}
      </div>
      <p className={popular ? "mt-2 text-sm text-primary-foreground/80" : "mt-2 text-sm text-muted-foreground"}>
        {body}
      </p>
      <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {compareAt ? (
          <span className="text-base font-medium line-through opacity-50">{compareAt}</span>
        ) : null}
        <span className="text-4xl font-semibold tracking-tight">
          {amount}
          <span className="text-base font-medium opacity-70">
            {interval === "yearly" ? "/yr" : "/mo"}
          </span>
        </span>
      </p>
      <Link
        href="/sign-in"
        className={popular ? `${onAccentCtaClass} mt-6` : `${secondaryCtaClass} mt-6 w-full`}
      >
        Start trial
      </Link>
      <ul className="mt-6 space-y-2.5 border-t border-current/10 pt-6">
        {pointers.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className={popular ? "text-primary-foreground/90" : "text-muted-foreground"}>
              {feature}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
