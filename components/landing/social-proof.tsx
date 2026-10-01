import { NumberTicker } from "@/components/landing/number-ticker";
import { Reveal } from "@/components/landing/reveal";

const stats = [
  {
    value: 56,
    label: "Call pickup",
    hint: "Of calls placed",
    suffix: "%+",
  },
  {
    value: 10,
    label: "Cart conversion",
    hint: "Of shoppers who answered",
    suffix: "%+",
  },
  {
    value: 5,
    label: "Calls converted",
    hint: "Of every call placed",
    suffix: "%+",
  },
  { value: 800, label: "Carts recovered", suffix: "+" },
];

export function SocialProof() {
  return (
    <section className="px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <p className="text-center text-sm text-muted-foreground">
            Last 7 days analytics from a Shark tank funded brand
          </p>
        </Reveal>
        <dl className="mt-8 grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card shadow-sm shadow-black/[0.04] dark:shadow-none md:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="border-b border-r border-border px-5 py-8 [&:nth-child(2n)]:border-r-0 [&:nth-child(n+3)]:border-b-0 md:[&:nth-child(2n)]:border-r md:[&:nth-child(4n)]:border-r-0 md:[&:nth-child(n+3)]:border-b-0"
            >
              <dt className="text-sm text-muted-foreground">{stat.label}</dt>
              <dd className="mt-2 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                <NumberTicker value={stat.value} suffix={stat.suffix} />
              </dd>
              {"hint" in stat && stat.hint ? (
                <p className="mt-2 text-xs text-muted-foreground">{stat.hint}</p>
              ) : null}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
