import { Children, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function OrbitingCircles({
  children,
  className,
  reverse = false,
  duration = 20,
  radius = 120,
  iconSize = 40,
}: {
  children: ReactNode;
  className?: string;
  reverse?: boolean;
  duration?: number;
  radius?: number;
  iconSize?: number;
}) {
  const items = Children.toArray(children);

  return (
    <div className="relative mx-auto" style={{ width: radius * 2 + iconSize, height: radius * 2 + iconSize }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <circle
          className="stroke-border"
          cx="50%"
          cy="50%"
          r={radius}
          fill="none"
          strokeWidth="1"
        />
      </svg>
      <span className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
      {items.map((child, index) => {
        const angle = (360 / items.length) * index;
        return (
          <div
            key={index}
            style={
              {
                "--duration": duration,
                "--radius": radius,
                "--angle": angle,
                width: iconSize,
                height: iconSize,
                marginLeft: -iconSize / 2,
                marginTop: -iconSize / 2,
              } as React.CSSProperties
            }
            className={cn(
              "absolute left-1/2 top-1/2 flex items-center justify-center rounded-full border border-border bg-card text-foreground motion-safe:animate-orbit motion-reduce:animate-none",
              reverse && "[animation-direction:reverse]",
              className
            )}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
