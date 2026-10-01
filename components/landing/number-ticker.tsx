"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

const formatNumber = new Intl.NumberFormat("en-US");

export function NumberTicker({
  value,
  className,
  suffix,
}: {
  value: number;
  className?: string;
  suffix?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px" });
  const formatted = formatNumber.format(value);
  const label = suffix ? `${formatted}${suffix}` : formatted;

  useEffect(() => {
    if (!ref.current) return;
    if (reduce) {
      ref.current.textContent = formatted;
      return;
    }
    if (!isInView) return;

    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        if (ref.current) {
          ref.current.textContent = formatNumber.format(Math.round(latest));
        }
      },
    });

    return () => controls.stop();
  }, [formatted, isInView, reduce, value]);

  return (
    <span className={className} aria-label={label}>
      <span ref={ref}>{reduce ? formatted : "0"}</span>
      {suffix ? <TickerSuffix suffix={suffix} /> : null}
    </span>
  );
}

function TickerSuffix({ suffix }: { suffix: string }) {
  if (suffix === "%+") {
    return (
      <>
        <span aria-hidden="true">%</span>
        <span aria-hidden="true" className="ml-0.5 align-super text-[0.55em]">
          +
        </span>
      </>
    );
  }

  if (suffix === "+") {
    return (
      <span aria-hidden="true" className="ml-0.5 align-super text-[0.55em]">
        +
      </span>
    );
  }

  return <span aria-hidden="true">{suffix}</span>;
}
