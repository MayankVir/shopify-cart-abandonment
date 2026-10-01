"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
      <Toaster
        theme="system"
        position="top-right"
        toastOptions={{
          classNames: {
            toast: "bg-card border-border text-foreground",
          },
        }}
      />
    </ThemeProvider>
  );
}
