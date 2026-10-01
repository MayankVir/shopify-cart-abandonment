"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it Works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-foreground transition duration-200 hover:bg-muted active:scale-[0.98]"
        aria-expanded={open}
        aria-controls="landing-mobile-nav"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X className="h-4 w-4" strokeWidth={1.5} />
        ) : (
          <Menu className="h-4 w-4" strokeWidth={1.5} />
        )}
        <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
      </button>
      {open ? (
        <div
          id="landing-mobile-nav"
          className="absolute inset-x-0 top-16 z-40 border-b border-border bg-background px-4 py-3"
        >
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="block rounded-xl px-3 py-3 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
