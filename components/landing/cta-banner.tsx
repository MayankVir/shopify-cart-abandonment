import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export function CtaBanner() {
  return (
    <section className="py-24 bg-black relative z-10 overflow-hidden">
      {/* Glow Effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl h-64 bg-indigo-600 rounded-full mix-blend-screen filter blur-[120px] opacity-20 pointer-events-none"></div>
      
      <div className="container mx-auto px-4 max-w-4xl relative z-10">
        <div className="rounded-3xl ring-1 ring-white/10 bg-white/[0.03] p-12 md:p-16 text-center backdrop-blur-xl relative overflow-hidden">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">Ready to stop losing sales?</h2>
          <p className="text-xl text-indigo-200 mb-10 max-w-2xl mx-auto">
            Join hundreds of Shopify merchants who are automating their abandoned cart recovery with AI voice today.
          </p>
          <Link href="/sign-in" className="inline-flex h-14 items-center justify-center rounded-md bg-white px-8 text-lg font-medium text-black shadow transition-colors hover:bg-gray-200">
            Start Your 14-Day Free Trial
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
          <p className="mt-6 text-sm text-gray-500">No credit card required. Setup takes 2 minutes.</p>
        </div>
      </div>
    </section>
  );
}
