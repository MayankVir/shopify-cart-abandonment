"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { DashboardEntryButton } from "@/components/landing/dashboard-entry-button";
import { navCtaClass } from "@/components/landing/styles";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { id: "features", href: "/#features", label: "Features" },
  { id: "how-it-works", href: "/#how-it-works", label: "How it Works" },
  { id: "pricing", href: "/#pricing", label: "Pricing" },
  { id: "faq", href: "/#faq", label: "FAQ" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const [pill, setPill] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 10);

      let next = "";
      for (const link of links) {
        const section = document.getElementById(link.id);
        if (!section) continue;
        const rect = section.getBoundingClientRect();
        if (rect.top <= 150 && rect.bottom >= 150) {
          next = link.id;
          break;
        }
      }
      setActive(next);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      if (!active) {
        setPill({ left: 0, width: 0 });
        return;
      }
      const item = list.querySelector<HTMLElement>(`[data-nav="${active}"]`);
      if (!item) return;
      setPill({ left: item.offsetLeft, width: item.offsetWidth });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [active, scrolled]);

  function goTo(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const section = document.getElementById(id);
    if (!section) return;
    event.preventDefault();
    setActive(id);
    setOpen(false);
    const top = section.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <header
      className={cn(
        "sticky z-50 flex justify-center px-4 transition-all duration-300 md:px-0",
        scrolled ? "top-6" : "top-4"
      )}
    >
      <div
        className="w-full min-w-0 transition-[max-width] duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
        style={{ maxWidth: scrolled ? 960 : 1280 }}
      >
        <div
          className={cn(
            "rounded-2xl transition-all duration-300",
            scrolled
              ? "border border-border bg-background/90 px-2 shadow-sm shadow-black/[0.04] backdrop-blur-lg dark:bg-background/75 dark:shadow-none"
              : "px-3 shadow-none md:px-7"
          )}
        >
          <div className="flex h-16 items-center justify-between gap-3">
            <Link href="/" className="flex shrink-0 items-center">
              <Logo compact />
            </Link>

            <div className="hidden min-w-0 flex-1 md:block">
              <ul
                ref={listRef}
                className="relative mx-auto flex h-11 w-fit items-center justify-center rounded-full px-2"
              >
                {links.map((link) => {
                  const selected = active === link.id;
                  return (
                    <li
                      key={link.id}
                      data-nav={link.id}
                      className="z-10 flex h-full items-center"
                    >
                      <a
                        href={link.href}
                        onClick={(event) => goTo(event, link.id)}
                        className={cn(
                          "px-4 text-sm font-medium tracking-tight transition-colors duration-200",
                          selected
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {link.label}
                      </a>
                    </li>
                  );
                })}
                {pill.width > 0 ? (
                  <motion.li
                    aria-hidden="true"
                    className="absolute inset-y-1.5 rounded-full border border-border bg-muted dark:bg-accent/60"
                    initial={false}
                    animate={{ left: pill.left, width: pill.width }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                ) : null}
              </ul>
            </div>

            <div className="flex shrink-0 items-center gap-1 md:gap-2">
              <div className="hidden md:block">
                {signedIn ? (
                  <DashboardEntryButton />
                ) : (
                  <Link href="/sign-in" className={`${navCtaClass} h-8`}>
                    Start trial
                  </Link>
                )}
              </div>
              <ThemeToggle />
              <button
                type="button"
                className="inline-flex size-8 items-center justify-center rounded-md border border-border md:hidden"
                aria-expanded={open}
                aria-label={open ? "Close menu" : "Open menu"}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <>
            <motion.button
              type="button"
              aria-label="Close menu"
              className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-sm dark:bg-black/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-3 z-50 mx-auto w-[95%] rounded-xl border border-border bg-background p-4 shadow-lg"
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              transition={{ type: "spring", damping: 15, stiffness: 200 }}
            >
              <div className="mb-3 flex items-center justify-between">
                <Logo compact />
                <button
                  type="button"
                  className="rounded-md border border-border p-1"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                >
                  <X className="size-5" />
                </button>
              </div>
              <ul className="mb-4 flex flex-col overflow-hidden rounded-md border border-border text-sm">
                {links.map((link) => (
                  <li key={link.id} className="border-b border-border last:border-b-0">
                    <a
                      href={link.href}
                      onClick={(event) => goTo(event, link.id)}
                      className={cn(
                        "block p-2.5 transition-colors hover:text-foreground",
                        active === link.id
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
              {signedIn ? (
                <DashboardEntryButton />
              ) : (
                <Link
                  href="/sign-in"
                  className={`${navCtaClass} h-8 w-full`}
                  onClick={() => setOpen(false)}
                >
                  Start trial
                </Link>
              )}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
