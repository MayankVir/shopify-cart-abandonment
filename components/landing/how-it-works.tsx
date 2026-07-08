export function HowItWorks() {
  return (
    <section className="py-24 bg-[#0a0a0a] border-t border-white/5 relative z-10" id="how-it-works">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How RecoverAI Works</h2>
          <p className="text-gray-400 text-lg">A fully automated pipeline from cart abandonment to successful recovery.</p>
        </div>

        <div className="space-y-12 relative py-8">
          {/* The vertical timeline line */}
          <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/10 -translate-x-1/2"></div>

          {/* Step 1 */}
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="md:w-1/2 text-left md:text-right md:pr-8">
              <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 font-semibold text-sm mb-4">Step 1</div>
              <h3 className="text-2xl font-bold text-white mb-3">Cart Abandoned</h3>
              <p className="text-gray-400">Our engine detects high-value carts abandoned on your Shopify store in real-time, fetching the exact variant IDs and customer context.</p>
            </div>
            <div className="hidden md:flex flex-col items-center relative justify-center w-8">
              <div className="w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-indigo-500/20 z-10"></div>
            </div>
            <div className="md:w-1/2 md:pl-8">
              <div className="rounded-xl ring-1 ring-white/10 bg-black/50 p-6 backdrop-blur-sm">
                <pre className="text-xs text-indigo-400 font-mono overflow-x-auto">
                  {`{\n  "event": "checkout.abandoned",\n  "customer": "+1234567890",\n  "value": "$240.00"\n}`}
                </pre>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex flex-col md:flex-row-reverse gap-8 items-center">
            <div className="md:w-1/2 md:pl-8 text-left">
              <div className="inline-block px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 font-semibold text-sm mb-4">Step 2</div>
              <h3 className="text-2xl font-bold text-white mb-3">AI Voice Dispatch</h3>
              <p className="text-gray-400">Tough Tongue AI instantly calls the customer, engaging them in a natural conversation to offer a discount or answer product questions.</p>
            </div>
            <div className="hidden md:flex flex-col items-center relative justify-center w-8">
              <div className="w-4 h-4 rounded-full bg-purple-500 ring-4 ring-purple-500/20 z-10"></div>
            </div>
            <div className="md:w-1/2 text-left md:text-right md:pr-8">
              <div className="rounded-xl ring-1 ring-white/10 bg-black/50 p-6 backdrop-blur-sm">
                <p className="text-sm text-gray-300 italic">&quot;Hi Sarah, I saw you left the electric bike in your cart. Can I offer you a 10% discount to complete the order today?&quot;</p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex flex-col md:flex-row gap-8 items-center">
            <div className="md:w-1/2 text-left md:text-right md:pr-8">
              <div className="inline-block px-3 py-1 rounded-full bg-green-500/20 text-green-300 font-semibold text-sm mb-4">Step 3</div>
              <h3 className="text-2xl font-bold text-white mb-3">Cart Rebuilt & Paid</h3>
              <p className="text-gray-400">If the customer accepts, our API automatically rebuilds their cart via the Shopify Storefront API and pushes the finalized order to your dashboard.</p>
            </div>
            <div className="hidden md:flex flex-col items-center relative justify-center w-8">
              <div className="w-4 h-4 rounded-full bg-green-500 ring-4 ring-green-500/20 z-10"></div>
            </div>
            <div className="md:w-1/2 md:pl-8">
              <div className="rounded-xl ring-1 ring-green-500/20 bg-green-500/5 p-6 flex items-center justify-center backdrop-blur-sm">
                <span className="text-green-400 font-semibold text-xl">+ $216.00 Recovered</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
