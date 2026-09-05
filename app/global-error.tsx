"use client";

import { useEffect } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ErrorFallback } from "@/components/error/error-fallback";
import "./globals.css";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary", error);
  }, [error]);

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${fontSans.variable} min-h-screen font-sans antialiased`}>
        <ErrorFallback
          error={error}
          title="RecoverAI needs a refresh"
          description="The app hit an unexpected error. Refresh to start a clean session."
        />
      </body>
    </html>
  );
}
