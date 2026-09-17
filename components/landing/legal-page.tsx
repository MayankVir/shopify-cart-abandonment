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
    <div className="min-h-screen bg-black text-foreground selection:bg-indigo-500/30">
      <Navbar />
      <main className="container mx-auto max-w-3xl px-4 py-16 md:py-24">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
          {title}
        </h1>
        <div className="mt-10 space-y-8 text-sm leading-7 text-gray-400 [&_a]:text-white [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
        <p className="mt-12 text-xs text-gray-600">
          This page is a product-accurate draft for RecoverAI. It is not legal
          advice. Have counsel review it before relying on it in production.
        </p>
      </main>
      <Footer />
    </div>
  );
}
