"use client";

import Image from "next/image";
import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

export function HeroDashboard() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.95", "center 0.55"],
  });
  const rotateX = useSpring(useTransform(scrollYProgress, [0, 1], [8, 0]), {
    stiffness: 120,
    damping: 24,
    mass: 0.4,
  });
  const scale = useSpring(useTransform(scrollYProgress, [0, 1], [0.96, 1]), {
    stiffness: 120,
    damping: 24,
    mass: 0.4,
  });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [16, 0]), {
    stiffness: 120,
    damping: 24,
    mass: 0.4,
  });

  return (
    <div
      ref={ref}
      className="relative mx-auto w-[95%] max-w-[76rem] pb-6 [perspective:1400px] md:pb-8"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[10%] z-0 h-40 w-[90%] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl dark:bg-primary/45 md:h-56"
      />
      <motion.div
        className="relative z-10 overflow-hidden rounded-xl border border-border bg-card shadow-xl shadow-black/[0.08] dark:border-white/10 dark:shadow-2xl"
        style={
          reduce
            ? undefined
            : {
                rotateX,
                scale,
                y,
                transformOrigin: "center top",
                transformStyle: "preserve-3d",
              }
        }
      >
        <div className="relative aspect-video w-full bg-card">
          <Image
            src="/landing/hero-dashboard-light.jpg"
            alt="Custello analytics dashboard with call volume, minutes, and recovered carts"
            fill
            priority
            sizes="(min-width: 1280px) 1152px, 92vw"
            className="object-cover object-top dark:hidden"
          />
          <Image
            src="/landing/hero-dashboard-dark.jpg"
            alt="Custello analytics dashboard with call volume, minutes, and recovered carts"
            fill
            sizes="(min-width: 1280px) 1152px, 92vw"
            className="hidden object-cover object-top dark:block"
          />
        </div>
      </motion.div>
    </div>
  );
}
