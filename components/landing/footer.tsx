import Link from 'next/link';
import { PhoneCall } from 'lucide-react';

export function Footer() {
  return (
    <footer className="relative bg-[#0a0a0a] pt-20 pb-12 overflow-hidden border-t border-white/5">
      <div className="container mx-auto px-4 max-w-7xl relative z-10">
        <div className="flex flex-col md:flex-row justify-between gap-12 mb-24">
          {/* Logo and Copyright */}
          <div className="w-full md:w-1/3 space-y-6">
            <Link href="/" className="flex items-center space-x-2">
              <div className="bg-white text-black p-1 rounded-md">
                <PhoneCall className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">RecoverAI</span>
            </Link>
            <p className="text-sm text-gray-500">
              © copyright RecoverAI {new Date().getFullYear()}. All rights reserved.
            </p>
          </div>

          {/* Links Columns */}
          <div className="w-full md:w-2/3 grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <h4 className="text-white font-semibold mb-6">Pages</h4>
              <ul className="space-y-4">
                <li><a href="#features" className="text-sm text-gray-400 hover:text-white transition-colors">All Features</a></li>
                <li><a href="#how-it-works" className="text-sm text-gray-400 hover:text-white transition-colors">How it works</a></li>
                <li><a href="#pricing" className="text-sm text-gray-400 hover:text-white transition-colors">Pricing</a></li>
                <li><a href="#faq" className="text-sm text-gray-400 hover:text-white transition-colors">FAQ</a></li>
              </ul>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-white font-semibold mb-6">Socials</h4>
              <ul className="space-y-4">
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Twitter</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">LinkedIn</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Instagram</a></li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-white font-semibold mb-6">Legal</h4>
              <ul className="space-y-4">
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Terms of Service</a></li>
                <li><a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Cookie Policy</a></li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-white font-semibold mb-6">Register</h4>
              <ul className="space-y-4">
                <li><Link href="/sign-in" className="text-sm text-gray-400 hover:text-white transition-colors">Sign Up</Link></li>
                <li><Link href="/sign-in" className="text-sm text-gray-400 hover:text-white transition-colors">Login</Link></li>
                <li><Link href="/sign-in" className="text-sm text-gray-400 hover:text-white transition-colors">Forgot Password</Link></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Giant Background Text Watermark */}
      <div className="absolute bottom-[-1rem] left-0 right-0 flex justify-center pointer-events-none select-none overflow-hidden">
        <span className="text-[17vw] font-black text-white/[0.03] leading-[0.8] whitespace-nowrap tracking-tighter">
          RecoverAI
        </span>
      </div>
    </footer>
  );
}
