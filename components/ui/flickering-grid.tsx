"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

interface FlickeringGridProps extends HTMLAttributes<HTMLDivElement> {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  maxOpacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number | string;
}

export function FlickeringGrid({
  squareSize = 4,
  gridGap = 6,
  flickerChance = 0.3,
  color = "rgb(0, 0, 0)",
  width,
  height,
  className,
  maxOpacity = 0.3,
  text,
  fontSize,
  fontWeight = 700,
  ...props
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInViewRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const memoizedColor = useMemo(() => {
    const toRGBA = (value: string) => {
      if (typeof window === "undefined") {
        return "rgba(156, 163, 175,";
      }
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      const match = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return "rgba(156, 163, 175,";
      return `rgba(${match[1]}, ${match[2]}, ${match[3]},`;
    };
    return toRGBA(color);
  }, [color]);

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, nextWidth: number, nextHeight: number) => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = nextWidth * dpr;
      canvas.height = nextHeight * dpr;
      canvas.style.width = `${nextWidth}px`;
      canvas.style.height = `${nextHeight}px`;
      const cols = Math.ceil(nextWidth / (squareSize + gridGap));
      const rows = Math.ceil(nextHeight / (squareSize + gridGap));
      const squares = new Float32Array(cols * rows);
      const mask = new Uint8Array(cols * rows);

      if (text && text.trim()) {
        const maskCanvas = document.createElement("canvas");
        maskCanvas.width = nextWidth * dpr;
        maskCanvas.height = nextHeight * dpr;
        const maskCtx = maskCanvas.getContext("2d");
        if (maskCtx) {
          const resolvedSize =
            fontSize ??
            Math.min(
              nextHeight * 0.72,
              (nextWidth * 0.92) / Math.max(text.length * 0.58, 1)
            );
          maskCtx.scale(dpr, dpr);
          maskCtx.fillStyle = "#fff";
          maskCtx.textAlign = "center";
          maskCtx.textBaseline = "middle";
          maskCtx.font = `${fontWeight} ${resolvedSize}px ${getComputedStyle(document.body).fontFamily}`;
          maskCtx.fillText(text, nextWidth / 2, nextHeight / 2);
          const pixels = maskCtx.getImageData(
            0,
            0,
            maskCanvas.width,
            maskCanvas.height
          ).data;

          for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
              const x = Math.floor(
                (i * (squareSize + gridGap) + squareSize / 2) * dpr
              );
              const y = Math.floor(
                (j * (squareSize + gridGap) + squareSize / 2) * dpr
              );
              const index = (y * maskCanvas.width + x) * 4 + 3;
              if (pixels[index] > 16) {
                const cell = i * rows + j;
                mask[cell] = 1;
                squares[cell] = Math.random() * maxOpacity;
              }
            }
          }
        }
      } else {
        mask.fill(1);
        for (let i = 0; i < squares.length; i++) {
          squares[i] = Math.random() * maxOpacity;
        }
      }

      return { cols, rows, squares, mask, dpr };
    },
    [squareSize, gridGap, maxOpacity, text, fontSize, fontWeight]
  );

  const updateSquares = useCallback(
    (squares: Float32Array, mask: Uint8Array, deltaTime: number) => {
      for (let i = 0; i < squares.length; i++) {
        if (!mask[i]) continue;
        if (Math.random() < flickerChance * deltaTime) {
          squares[i] = Math.random() * maxOpacity;
        }
      }
    },
    [flickerChance, maxOpacity]
  );

  const drawGrid = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      cols: number,
      rows: number,
      squares: Float32Array,
      mask: Uint8Array,
      dpr: number
    ) => {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const cell = i * rows + j;
          if (!mask[cell]) continue;
          ctx.fillStyle = `${memoizedColor}${squares[cell]})`;
          ctx.fillRect(
            i * (squareSize + gridGap) * dpr,
            j * (squareSize + gridGap) * dpr,
            squareSize * dpr,
            squareSize * dpr
          );
        }
      }
    },
    [memoizedColor, squareSize, gridGap]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (!canvas || !container || !ctx) return;

    let animationFrameId: number | null = null;
    let gridParams: ReturnType<typeof setupCanvas> | null = null;
    let lastTime = 0;

    const updateCanvasSize = () => {
      const nextWidth = width || container.clientWidth;
      const nextHeight = height || container.clientHeight;
      setCanvasSize({ width: nextWidth, height: nextHeight });
      gridParams = setupCanvas(canvas, nextWidth, nextHeight);
    };

    const animate = (time: number) => {
      if (!isInViewRef.current || !gridParams) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }
      const deltaTime = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      updateSquares(gridParams.squares, gridParams.mask, deltaTime);
      drawGrid(
        ctx,
        gridParams.cols,
        gridParams.rows,
        gridParams.squares,
        gridParams.mask,
        gridParams.dpr
      );
      animationFrameId = requestAnimationFrame(animate);
    };

    updateCanvasSize();

    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isInViewRef.current = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(canvas);
    isInViewRef.current = true;
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [setupCanvas, updateSquares, drawGrid, width, height]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full", className)}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
        }}
      />
    </div>
  );
}
