import { Globe, LineChart, MessageCircle, Phone, ShoppingBag } from "lucide-react";
import { NumberTicker } from "@/components/landing/number-ticker";
import { OrbitingCircles } from "@/components/landing/orbiting-circles";
import { Reveal } from "@/components/landing/reveal";
import { Tilt } from "@/components/landing/motion";
import { surfaceClass } from "@/components/landing/styles";
import { cn } from "@/lib/utils";

const products = [
  {
    name: "Abandoned cart recovery",
    body: "When a shopper leaves checkout, Custello calls, answers questions, and helps them finish the order.",
  },
  {
    name: "RTO reduction",
    body: "When a delivery is likely to fail, Custello calls to confirm the address and keep the shipment moving.",
  },
];

const bars = [14, 26, 18, 34, 22, 30, 16];

export function Features() {
  return (
    <section
      id="features"
      className="scroll-mt-24 border-t border-border px-4 py-16 md:py-28"
    >
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
              Two ways Custello protects revenue
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Abandoned carts and failed deliveries are the two jobs. The same
              voice agent handles both.
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <Reveal className="h-full [perspective:1000px]">
            <Tilt className="h-full">
              <article className={cn("flex h-full min-h-[280px] flex-col justify-between p-6 md:p-8", surfaceClass)}>
                <div className="flex h-16 items-end gap-1.5" aria-hidden="true">
                  {bars.map((height, index) => (
                    <span
                      key={height}
                      className="w-1.5 origin-bottom rounded-full bg-primary motion-safe:animate-pulse"
                      style={{
                        height,
                        animationDelay: `${index * 140}ms`,
                      }}
                    />
                  ))}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {products[0].name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {products[0].body}
                  </p>
                </div>
              </article>
            </Tilt>
          </Reveal>

          <Reveal delay={0.08} className="h-full [perspective:1000px]">
            <Tilt className="h-full">
              <article className={cn("flex h-full min-h-[280px] flex-col justify-between overflow-hidden p-6 md:p-8", surfaceClass)}>
                <div className="flex justify-center">
                  <OrbitingCircles radius={72} iconSize={36} duration={22}>
                    <Phone className="h-4 w-4" strokeWidth={1.5} />
                    <Globe className="h-4 w-4" strokeWidth={1.5} />
                    <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
                    <LineChart className="h-4 w-4" strokeWidth={1.5} />
                  </OrbitingCircles>
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {products[1].name}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {products[1].body}
                  </p>
                </div>
              </article>
            </Tilt>
          </Reveal>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Reveal className="h-full [perspective:1000px] md:col-span-1">
            <Tilt className="h-full">
              <article className="flex h-full flex-col justify-between rounded-2xl bg-primary p-6 text-primary-foreground shadow-sm shadow-primary/20 md:min-h-[240px] md:p-8 dark:shadow-none">
                <p className="text-4xl font-semibold tracking-tight md:text-5xl">
                  <NumberTicker value={800} suffix="+" className="text-primary-foreground" />
                  <span className="mt-2 block text-sm font-medium text-primary-foreground/80">
                    Carts recovered
                  </span>
                </p>
                <div className="mt-8">
                  <h3 className="text-xl font-semibold">Live analytics</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-foreground/80">
                    Watch every call as it happens. See who answered, which carts
                    came back, which deliveries were saved, and what that was
                    worth.
                  </p>
                </div>
              </article>
            </Tilt>
          </Reveal>

          <Reveal delay={0.08} className="h-full [perspective:1000px]">
            <Tilt className="h-full">
              <article className={cn(surfaceClass, "flex h-full flex-col justify-between bg-muted p-6 md:min-h-[240px] md:p-8")}>
                <Phone className="h-5 w-5 text-foreground" strokeWidth={1.5} />
                <div className="mt-8">
                  <h3 className="text-xl font-semibold text-foreground">
                    Human-like voice calling
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Shoppers hear a natural voice, with pauses and a real
                    conversation, not a recorded menu.
                  </p>
                </div>
              </article>
            </Tilt>
          </Reveal>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Reveal className="h-full [perspective:1000px]">
            <Tilt className="h-full">
              <article className={cn("h-full p-6", surfaceClass)}>
                <Globe className="h-5 w-5 text-foreground" strokeWidth={1.5} />
                <h3 className="mt-5 text-lg font-semibold text-foreground">
                  Global SIP dispatch
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Call shoppers on local numbers, in the language they expect,
                  in India and abroad.
                </p>
              </article>
            </Tilt>
          </Reveal>
          <Reveal delay={0.06} className="h-full [perspective:1000px]">
            <Tilt className="h-full">
              <article className={cn("h-full p-6", surfaceClass)}>
                <ShoppingBag className="h-5 w-5 text-foreground" strokeWidth={1.5} />
                <h3 className="mt-5 text-lg font-semibold text-foreground">
                  GoKwik and checkout
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Connects to GoKwik and checkout extensions, so the call knows
                  what the shopper left behind.
                </p>
              </article>
            </Tilt>
          </Reveal>
          <Reveal delay={0.12} className="h-full [perspective:1000px]">
            <Tilt className="h-full">
              <article className={cn(surfaceClass, "h-full border-dashed bg-muted/60 p-6")}>
                <MessageCircle className="h-5 w-5 text-foreground" strokeWidth={1.5} />
                <p className="mt-5 text-sm font-medium text-foreground">Coming soon</p>
                <h3 className="mt-1 text-lg font-semibold text-foreground">
                  WhatsApp and email
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Follow-up on WhatsApp and email is on the way. Voice is what
                  runs today.
                </p>
              </article>
            </Tilt>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
