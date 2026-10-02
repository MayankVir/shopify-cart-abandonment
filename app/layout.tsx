import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import {
  IBM_Plex_Mono,
  Libre_Baskerville,
  Lora,
  Plus_Jakarta_Sans,
  Poppins,
} from "next/font/google";
import { Providers } from "@/components/providers";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { colorScheme, colorSchemeClass } from "@/lib/color-scheme";
import "./globals.css";

const fontJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fontLora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
});

const fontPoppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const fontLibre = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
});

const fontVariables =
  colorScheme === "hearth"
    ? `${fontPoppins.variable} ${fontLibre.variable} ${fontMono.variable}`
    : `${fontJakarta.variable} ${fontLora.variable} ${fontMono.variable}`;

export const metadata: Metadata = {
  title: "Custello",
  description:
    "An AI voice agent that recovers lost revenue from abandoned carts and deliveries that would otherwise return.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html
        lang="en"
        className={colorSchemeClass[colorScheme]}
        suppressHydrationWarning
      >
        <body className={`${fontVariables} min-h-screen antialiased`}>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
