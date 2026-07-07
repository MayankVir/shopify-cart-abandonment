const faqs = [
  {
    question: "How fast does the AI call the customer?",
    answer: "Our engine polls your Shopify admin in real-time. As soon as a cart is marked abandoned (usually within 10-15 minutes of inactivity), the SIP call is dispatched instantly."
  },
  {
    question: "Will the AI sound like a robot?",
    answer: "No. We use state-of-the-art TTS models (like ElevenLabs or Deepgram) that simulate human breathing, pauses, and natural intonation. Most customers believe they are speaking to a real support agent."
  },
  {
    question: "How is the discount applied?",
    answer: "If the customer accepts the offer over the phone, our system uses the Shopify Storefront API to regenerate their cart with the agreed-upon discount code automatically applied, and texts or emails them the final secure checkout link."
  },
  {
    question: "Do I need my own Twilio account?",
    answer: "Starter and Pro plans run on our managed telecom infrastructure. If you are on the Enterprise plan, you can bring your own Twilio credentials to use your existing business phone numbers."
  },
];

export function Faq() {
  return (
    <section className="py-24 bg-[#0a0a0a] border-t border-white/5 relative z-10" id="faq">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Frequently Asked Questions</h2>
          <p className="text-gray-400 text-lg">Everything you need to know about the product and billing.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white/[0.02] ring-1 ring-white/5 p-6 rounded-xl">
              <h3 className="text-lg font-semibold text-white mb-3">{faq.question}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
