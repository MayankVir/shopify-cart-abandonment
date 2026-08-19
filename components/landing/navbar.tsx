import Link from 'next/link';
import { PhoneCall } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { DashboardEntryButton } from '@/components/landing/dashboard-entry-button';

export async function Navbar() {
  const { userId } = await auth();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/50 backdrop-blur-md">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <PhoneCall className="h-6 w-6 text-indigo-500" />
          <span className="text-xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">RecoverAI</span>
        </Link>
        
        <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-gray-300">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
        </div>

        <div className="flex items-center space-x-4">
          {userId ? (
            <DashboardEntryButton />
          ) : (
            <Link href="/sign-in" className="inline-flex h-9 items-center justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-black shadow transition-colors hover:bg-gray-200">
              Get Started
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
