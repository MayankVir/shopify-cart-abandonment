import { Bot, Zap, LineChart, Globe } from 'lucide-react';

const features = [
  {
    name: 'AI Voice Calling',
    description: 'Human-like conversational AI that calls customers within minutes of abandonment.',
    icon: Bot,
  },
  {
    name: 'Instant Shopify Sync',
    description: 'Directly polls Shopify Admin GraphQL for real-time abandoned checkout detection.',
    icon: Zap,
  },
  {
    name: 'Global SIP Dispatch',
    description: 'Call customers anywhere in the world with localized numbers and accents.',
    icon: Globe,
  },
  {
    name: 'Live Analytics',
    description: 'Track recovery rates, active calls, and exact dollar amounts recovered in real-time.',
    icon: LineChart,
  },
];

export function Features() {
  return (
    <section className="py-24 bg-black border-t border-white/5 relative z-10" id="features">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Everything you need to recover revenue</h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            A complete pipeline designed specifically for high-volume B2B and DTC Shopify brands.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {features.map((feature) => (
            <div key={feature.name} className="relative group rounded-2xl ring-1 ring-white/10 bg-white/[0.02] p-8 hover:bg-white/[0.04] transition-colors">
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none" />
              <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-indigo-500/10 p-3 text-indigo-400 ring-1 ring-white/10">
                <feature.icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{feature.name}</h3>
              <p className="text-gray-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
