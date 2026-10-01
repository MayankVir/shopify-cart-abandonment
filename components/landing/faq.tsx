"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Reveal } from "@/components/landing/reveal";

const faqs = [
  {
    question: "Is this only for abandoned carts?",
    answer:
      "No. Custello calls shoppers who leave checkout, and it also calls when a delivery is likely to return to you. Those are the two products.",
  },
  {
    question: "Will the call sound like a robot?",
    answer:
      "No. The voice pauses, answers, and follows the conversation. Most shoppers treat it as a person from the store.",
  },
  {
    question: "Do you send WhatsApp or email?",
    answer:
      "Not yet. WhatsApp and email follow-ups are coming soon. Calls are what run today.",
  },
  {
    question: "Do I need my own phone account?",
    answer:
      "No. Calling is included on every plan. You connect the store and choose cart recovery, RTO, or both.",
  },
];

export function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section id="faq" className="scroll-mt-24 border-t border-border px-4 py-16 md:py-28">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <div className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
              Frequently asked questions
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              What the calls do, and what is still on the way.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 divide-y divide-border border-y border-border">
          {faqs.map((faq, index) => {
            const expanded = open === index;
            return (
              <div key={faq.question}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-6 rounded-lg py-5 text-left text-base font-medium text-foreground transition-colors hover:text-foreground/80"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? -1 : index)}
                >
                  {faq.question}
                  <span
                    aria-hidden="true"
                    className={`text-xl leading-none text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-45" : ""}`}
                  >
                    +
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 text-sm leading-relaxed text-muted-foreground">
                        {faq.answer}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
