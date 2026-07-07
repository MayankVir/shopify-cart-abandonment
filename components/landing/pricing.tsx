import { Check } from 'lucide-react';
import Link from 'next/link';

const plans = [
  {
    name: "Starter",
    price: "$49",
    description: "Perfect for emerging stores testing AI recovery.",
    features: [
      "Up to 100 AI voice calls/mo",
      "Real-time Shopify polling",
      "Basic recovery analytics",
      "Email support"
    ]
  },
  {
    name: "Pro",
    price: "$99",
    description: "For high-volume stores maximizing revenue.",
    popular: true,
    features: [
      "Up to 500 AI voice calls/mo",
      "Instant checkout detection",
      "Advanced ROI tracking",
      "Custom AI voice scripts",
      "Priority 24/7 support"
    ]
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "Unlimited scale for Shopify Plus brands.",
    features: [
      "Unlimited AI voice calls",
      "Dedicated account manager",
      "Bring your own Twilio numbers",
      "Custom integrations",
      "White-glove onboarding"
    ]
  }
];

export function Pricing() {
  return (
    <section className="py-24 bg-black border-t border-white/5 relative z-10" id="pricing">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h2>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg">
            Stop losing sales. Our tool pays for itself within the first 3 recovered carts.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div 
              key={plan.name} 
              className={`relative rounded-2xl ring-1 ${
                plan.popular 
                  ? 'ring-indigo-500/50 bg-white/[0.04] shadow-2xl shadow-indigo-500/10' 
                  : 'ring-white/10 bg-white/[0.02]'
              } p-8 flex flex-col`}
            >
              {plan.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-gray-400 text-sm h-10">{plan.description}</p>
              </div>
              
              <div className="mb-6">
                <span className="text-4xl font-bold text-white">{plan.price}</span>
                {plan.price !== "Custom" && <span className="text-gray-500">/mo</span>}
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start">
                    <Check className="h-5 w-5 text-indigo-400 shrink-0 mr-3" />
                    <span className="text-gray-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Link 
                href="/sign-in" 
                className={`w-full py-3 px-4 rounded-lg text-center font-medium transition-colors ${
                  plan.popular 
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {plan.price === "Custom" ? "Contact Sales" : "Start Free Trial"}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
