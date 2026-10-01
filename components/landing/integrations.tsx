import { Reveal } from "@/components/landing/reveal";

function GoKwikMark() {
  return (
    <svg viewBox="0 0 132 28" className="h-6 w-auto text-foreground" aria-hidden="true">
      <circle cx="12" cy="14" r="10" className="fill-primary" />
      <path
        d="M8.2 14.8c1.6-3.2 3.4-5.2 5.4-6.2.4 1.6.2 3.2-.6 4.8-1.2 2.4-1.2 4.2 0 5.6 1.4 1.6 3.6 1.2 5.2-.8"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <text
        x="30"
        y="19"
        fill="currentColor"
        fontFamily="inherit"
        fontSize="16"
        fontWeight="700"
      >
        GoKwik
      </text>
    </svg>
  );
}

function ShiprocketMark() {
  return (
    <svg viewBox="0 0 156 28" className="h-6 w-auto text-foreground" aria-hidden="true">
      <path
        d="M14 4.5l2.2 6.2H22l-4.6 3.6 1.8 6.2L14 17.2 8.8 20.5l1.8-6.2L6 10.7h5.8L14 4.5z"
        className="fill-primary"
      />
      <text
        x="30"
        y="19"
        fill="currentColor"
        fontFamily="inherit"
        fontSize="16"
        fontWeight="700"
      >
        Shiprocket
      </text>
    </svg>
  );
}

const partners = [
  { name: "GoKwik", Mark: GoKwikMark },
  { name: "Shiprocket", Mark: ShiprocketMark },
];

export function Integrations() {
  return (
    <section className="px-4 pb-6 md:pb-10">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <p className="text-center text-sm text-muted-foreground">
            Checkout and shipping, connected
          </p>
          <ul className="mx-auto mt-5 grid max-w-2xl grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card shadow-sm shadow-black/[0.04] dark:shadow-none">
            {partners.map((partner) => (
              <li
                key={partner.name}
                className="flex h-16 items-center justify-center border-r border-border bg-muted/40 px-4 last:border-r-0"
              >
                <partner.Mark />
                <span className="sr-only">{partner.name}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
