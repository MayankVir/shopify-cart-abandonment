"use client";

import { FlickeringGrid } from "@/components/ui/flickering-grid";

export function FooterBrandMark() {
  return (
    <div
      aria-hidden="true"
      className="relative z-0 mt-2 h-[4.75rem] w-full overflow-hidden md:mt-3 md:h-32"
    >
      <div className="absolute inset-0">
        <FlickeringGrid
          text="custello"
          color="var(--primary)"
          className="h-full w-full"
          squareSize={3}
          gridGap={4}
          flickerChance={0.12}
          maxOpacity={0.22}
          fontWeight={800}
        />
      </div>
    </div>
  );
}
