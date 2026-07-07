import Link from 'next/link';
import { ArrowRight, ShoppingCart, PhoneOutgoing } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-black text-white pt-24 pb-32">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-indigo-600 rounded-full mix-blend-screen filter blur-[100px] animate-blob"></div>
        <div className="absolute top-20 right-20 w-72 h-72 bg-purple-600 rounded-full mix-blend-screen filter blur-[100px] animate-blob" style={{ animationDelay: '2s' }}></div>
        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-72 h-72 bg-pink-600 rounded-full mix-blend-screen filter blur-[100px] animate-blob" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-in-up">
          <div className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-sm font-medium text-indigo-300">
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 mr-2"></span>
            Now integrating directly with Shopify
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Recover Abandoned Carts with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">AI Voice</span>
          </h1>
          
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Stop losing 70% of your sales at checkout. Our AI instantly calls high-value customers when they abandon their cart, offers a discount, and completes the sale.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/sign-in" className="inline-flex h-12 items-center justify-center rounded-md bg-indigo-600 px-8 text-base font-medium text-white shadow transition-colors hover:bg-indigo-700 w-full sm:w-auto">
              Start Recovering Sales
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <a href="#how-it-works" className="inline-flex h-12 items-center justify-center rounded-md border border-white/20 bg-transparent px-8 text-base font-medium text-white shadow-sm transition-colors hover:bg-white/10 w-full sm:w-auto">
              See How It Works
            </a>
          </div>
        </div>

        {/* Abstract UI Mockup */}
        <div className="mt-20 max-w-5xl mx-auto animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="rounded-xl ring-1 ring-white/10 bg-white/[0.02] p-2 backdrop-blur-xl">
            <div className="rounded-lg ring-1 ring-white/5 bg-black/50 p-8 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-white/[0.02] ring-1 ring-white/5">
                  <div className="p-3 rounded-full bg-red-500/20 text-red-400">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Cart Abandoned</p>
                    <p className="text-sm text-gray-400">$240.00 value detected</p>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex justify-center">
                <div className="w-full max-w-[200px] h-[2px] bg-gradient-to-r from-red-500/50 via-indigo-500/50 to-green-500/50 relative">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black p-2 rounded-full ring-1 ring-white/10">
                    <PhoneOutgoing className="h-5 w-5 text-indigo-400" />
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-lg bg-white/[0.02] ring-1 ring-white/5">
                  <div className="p-3 rounded-full bg-green-500/20 text-green-400">
                    <ShoppingCart className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-medium text-white">Sale Recovered!</p>
                    <p className="text-sm text-gray-400">Discount applied automatically</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
