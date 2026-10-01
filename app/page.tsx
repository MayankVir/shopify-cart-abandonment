import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { SocialProof } from "@/components/landing/social-proof";
import { Integrations } from "@/components/landing/integrations";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SavingsCalculator } from "@/components/landing/savings-calculator";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { CtaBanner } from "@/components/landing/cta-banner";
import { Footer } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-primary/20">
      <Navbar />
      <main>
        <Hero />
        <SocialProof />
        <Integrations />
        <Features />
        <HowItWorks />
        <SavingsCalculator />
        <Pricing />
        <Faq />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
