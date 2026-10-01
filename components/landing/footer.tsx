import Link from "next/link";
import { FooterBrandMark } from "@/components/landing/footer-brand-mark";
import { Logo } from "@/components/logo";

export function Footer() {
  return (
    <footer className="overflow-hidden border-t border-border bg-background pb-0 pt-14">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 md:flex-row md:justify-between">
        <div className="max-w-xs space-y-5">
          <Link href="/" className="flex items-center">
            <Logo />
          </Link>
          <p className="text-sm text-muted-foreground">
            © Custello {new Date().getFullYear()}. All rights reserved.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Pages</h2>
            <ul className="mt-4 space-y-3">
              <li><Link href="/#features" className="text-sm text-muted-foreground hover:text-foreground">All Features</Link></li>
              <li><Link href="/#how-it-works" className="text-sm text-muted-foreground hover:text-foreground">How it works</Link></li>
              <li><Link href="/#pricing" className="text-sm text-muted-foreground hover:text-foreground">Pricing</Link></li>
              <li><Link href="/#faq" className="text-sm text-muted-foreground hover:text-foreground">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Socials</h2>
            <ul className="mt-4 space-y-3">
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">Twitter</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">LinkedIn</a></li>
              <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground">Instagram</a></li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Legal</h2>
            <ul className="mt-4 space-y-3">
              <li><Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">Terms of Service</Link></li>
              <li><Link href="/privacy#cookies" className="text-sm text-muted-foreground hover:text-foreground">Cookie Policy</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Register</h2>
            <ul className="mt-4 space-y-3">
              <li><Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">Start trial</Link></li>
              <li><Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">Login</Link></li>
              <li><Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground">Forgot Password</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <FooterBrandMark />
    </footer>
  );
}
