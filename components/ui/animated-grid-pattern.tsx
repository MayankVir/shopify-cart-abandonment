"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "@/lib/utils";

export interface AnimatedGridPatternProps
  extends ComponentPropsWithoutRef<"svg"> {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  strokeDasharray?: number;
  numSquares?: number;
  maxOpacity?: number;
  duration?: number;
  repeatDelay?: number;
}

type Square = {
  id: number;
  pos: [number, number];
  iteration: number;
};

export function AnimatedGridPattern({
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = 0,
  numSquares = 50,
  className,
  maxOpacity = 0.5,
  duration = 4,
  repeatDelay = 0.5,
  ...props
}: AnimatedGridPatternProps) {
  const id = useId();
  const containerRef = useRef<SVGSVGElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [squares, setSquares] = useState<Array<Square>>([]);
  const [cursor, setCursor] = useState<{ col: number; row: number } | null>(
    null
  );

  const getPos = useCallback((): [number, number] => {
    return [
      Math.floor((Math.random() * dimensions.width) / width),
      Math.floor((Math.random() * dimensions.height) / height),
    ];
  }, [dimensions.height, dimensions.width, height, width]);

  const generateSquares = useCallback(
    (count: number) => {
      return Array.from({ length: count }, (_, i) => ({
        id: i,
        pos: getPos(),
        iteration: 0,
      }));
    },
    [getPos]
  );

  const updateSquarePosition = useCallback(
    (squareId: number) => {
      setSquares((currentSquares) => {
        const current = currentSquares[squareId];
        if (!current || current.id !== squareId) return currentSquares;

        const nextSquares = currentSquares.slice();
        nextSquares[squareId] = {
          ...current,
          pos: getPos(),
          iteration: current.iteration + 1,
        };

        return nextSquares;
      });
    },
    [getPos]
  );

  useEffect(() => {
    if (dimensions.width && dimensions.height) {
      setSquares(generateSquares(numSquares));
    }
  }, [dimensions.width, dimensions.height, generateSquares, numSquares]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions((currentDimensions) => {
          const nextWidth = entry.contentRect.width;
          const nextHeight = entry.contentRect.height;
          if (
            currentDimensions.width === nextWidth &&
            currentDimensions.height === nextHeight
          ) {
            return currentDimensions;
          }
          return { width: nextWidth, height: nextHeight };
        });
      }
    });

    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const element = containerRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!inside) {
        setCursor((current) => (current === null ? current : null));
        return;
      }

      const col = Math.floor((event.clientX - rect.left - x) / width);
      const row = Math.floor((event.clientY - rect.top - y) / height);
      setCursor((current) =>
        current?.col === col && current?.row === row ? current : { col, row }
      );
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [height, width, x, y]);

  const glowCells = cursor
    ? Array.from({ length: 5 }, (_, offsetY) =>
        Array.from({ length: 5 }, (_, offsetX) => {
          const distance = Math.hypot(offsetX - 2, offsetY - 2);
          if (distance > 2.2) return null;
          return {
            col: cursor.col + offsetX - 2,
            row: cursor.row + offsetY - 2,
            opacity: (1 - distance / 2.6) * 0.7,
          };
        })
      )
        .flat()
        .filter((cell): cell is { col: number; row: number; opacity: number } =>
          Boolean(cell)
        )
    : [];

  return (
    <svg
      ref={containerRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full fill-primary/20 stroke-primary/20",
        className
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill="none"
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
      <svg x={x} y={y} className="overflow-visible">
        {squares.map(({ pos: [squareX, squareY], id: squareId, iteration }, index) => (
          <motion.rect
            initial={{ opacity: 0 }}
            animate={{ opacity: maxOpacity }}
            transition={{
              duration,
              repeat: 1,
              delay: index * 0.1,
              repeatType: "reverse",
              repeatDelay,
            }}
            onAnimationComplete={() => updateSquarePosition(squareId)}
            key={`${squareId}-${iteration}`}
            width={width - 1}
            height={height - 1}
            x={squareX * width + 1}
            y={squareY * height + 1}
            fill="currentColor"
            strokeWidth="0"
          />
        ))}
        <AnimatePresence>
          {glowCells.map(({ col, row, opacity }) => (
            <motion.rect
              key={`glow-${col}-${row}`}
              initial={{ opacity: 0 }}
              animate={{ opacity }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              width={width - 1}
              height={height - 1}
              x={col * width + 1}
              y={row * height + 1}
              fill="currentColor"
              strokeWidth="0"
            />
          ))}
        </AnimatePresence>
      </svg>
    </svg>
  );
}
