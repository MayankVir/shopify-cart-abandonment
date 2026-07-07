export function SocialProof() {
  // A list of fake brand names or generic placeholders for the marquee
  const brands = [
    "TechGadgets",
    "FitWear",
    "BeautyCo",
    "HomeEssentials",
    "OutdoorGear",
    "UrbanApparel",
    "EcoLife",
    "SmartKitchen",
  ];

  return (
    <section className="py-12 bg-black border-t border-white/5 overflow-hidden">
      <div className="container mx-auto px-4 text-center mb-8">
        <p className="text-sm font-medium text-gray-500 uppercase tracking-widest">
          Trusted by 500+ high-volume Shopify stores
        </p>
      </div>
      
      <div className="relative flex max-w-[100vw] overflow-hidden">
        {/* Gradient overlays to fade the edges */}
        <div className="absolute top-0 bottom-0 left-0 w-32 bg-gradient-to-r from-black to-transparent z-10 pointer-events-none"></div>
        <div className="absolute top-0 bottom-0 right-0 w-32 bg-gradient-to-l from-black to-transparent z-10 pointer-events-none"></div>

        <div className="flex animate-marquee whitespace-nowrap">
          {[...brands, ...brands, ...brands].map((brand, i) => (
            <span key={i} className="mx-8 text-2xl font-bold text-gray-800">
              {brand}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
