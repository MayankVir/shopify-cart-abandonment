import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/20">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-sm text-muted-foreground">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
          {title}
        </h1>
        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
        <p className="mt-12 text-xs text-muted-foreground">
          This page is a product-accurate draft for Custello. It is not legal
          advice. Have counsel review it before relying on it in production.
        </p>
      </main>
      <Footer />
    </div>
  );
}
