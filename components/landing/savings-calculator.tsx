"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

function inr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.round(value)));
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;

  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm text-foreground">
        {label}
        <span className="tabular-nums text-muted-foreground">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
        className="savings-range mt-3 h-6 w-full cursor-pointer appearance-none bg-transparent"
        style={{ ["--fill" as string]: `${fill}%` }}
      />
    </label>
  );
}

const CART_RECOVERY = 0.06;
const RETURNS_KEPT = 0.25;
const RETURN_COST = 180;

export function SavingsCalculator() {
  const [carts, setCarts] = useState(1000);
  const [returns, setReturns] = useState(300);
  const [orderValue, setOrderValue] = useState(1500);

  const result = useMemo(() => {
    const recovered = carts * CART_RECOVERY * orderValue;
    const kept = returns * RETURNS_KEPT * RETURN_COST;
    return { recovered, kept, total: recovered + kept };
  }, [carts, orderValue, returns]);

  return (
    <section id="savings" className="scroll-mt-24 border-t border-border px-4 py-16 md:py-28">
      <style>{`
        .savings-range {
          --track: color-mix(in oklab, var(--muted-foreground) 22%, transparent);
          --thumb: var(--background);
          background: transparent;
        }
        .savings-range::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
          background: linear-gradient(to right, var(--primary) var(--fill), var(--track) var(--fill));
        }
        .savings-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 18px;
          width: 18px;
          margin-top: -6px;
          border-radius: 999px;
          border: 2px solid var(--primary);
          background: var(--thumb);
          box-shadow: 0 1px 2px hsl(0 0% 0% / 0.25);
        }
        .savings-range::-moz-range-track {
          height: 6px;
          border: none;
          border-radius: 999px;
          background: var(--track);
        }
        .savings-range::-moz-range-progress {
          height: 6px;
          border-radius: 999px;
          background: var(--primary);
        }
        .savings-range::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 999px;
          border: 2px solid var(--primary);
          background: var(--thumb);
        }
      `}</style>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm shadow-black/[0.04] dark:shadow-none">
            Savings calculator
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            Calculate your savings
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            See what voice calls can bring back from carts left at checkout, and
            from deliveries that would otherwise return.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card shadow-sm shadow-black/[0.04] dark:shadow-none md:grid md:grid-cols-2">
          <div className="p-6 md:p-8">
            <h3 className="text-xl font-semibold text-foreground">Your store</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Three numbers from a typical month.
            </p>

            <div className="mt-8 space-y-6">
              <SliderRow
                label="Abandoned carts / month"
                value={carts}
                min={100}
                max={10000}
                step={100}
                display={carts.toLocaleString("en-IN")}
                onChange={setCarts}
              />
              <SliderRow
                label="Likely returns / month"
                value={returns}
                min={20}
                max={5000}
                step={20}
                display={returns.toLocaleString("en-IN")}
                onChange={setReturns}
              />
              <SliderRow
                label="Average order value"
                value={orderValue}
                min={300}
                max={10000}
                step={100}
                display={inr(orderValue)}
                onChange={setOrderValue}
              />
            </div>
          </div>

          <div className="border-t border-border bg-muted/40 p-6 md:border-l md:border-t-0 md:p-8">
            <h3 className="text-xl font-semibold text-foreground">With Custello</h3>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
              {inr(result.total)}
              <span className="ml-1 text-base font-medium text-muted-foreground">/ month</span>
            </p>

            <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex gap-3 p-4">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-chart-1 text-white">
                  <Check className="size-4" strokeWidth={2.5} />
                </span>
                <p className="text-sm leading-relaxed text-foreground">
                  Bring back about{" "}
                  <span className="font-semibold text-chart-1">{inr(result.recovered)}</span>{" "}
                  from carts left at checkout.
                </p>
              </div>
              <div className="flex gap-3 border-t border-border p-4">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-chart-1 text-white">
                  <Check className="size-4" strokeWidth={2.5} />
                </span>
                <p className="text-sm leading-relaxed text-foreground">
                  Keep about{" "}
                  <span className="font-semibold text-chart-1">{inr(result.kept)}</span> that
                  would have come back as returns.
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              Assumes 6% of those carts come back, and 25% of likely returns
              are kept at ₹180 each.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
