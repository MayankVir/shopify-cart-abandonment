"use client";

import { FlickeringGrid } from "@/components/ui/flickering-grid";

export function FooterBrandMark() {
  return (
    <div
      aria-hidden="true"
      className="relative z-0 mt-16 h-48 w-full overflow-hidden md:mt-24 md:h-64"
    >
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-transparent from-40% to-background" />
      <div className="absolute inset-0 mx-4 md:mx-6">
        <FlickeringGrid
          text="custello"
          color="hsl(var(--muted-foreground))"
          className="h-full w-full"
          squareSize={3}
          gridGap={4}
          flickerChance={0.12}
          maxOpacity={0.5}
          fontWeight={800}
        />
      </div>
    </div>
  );
}
