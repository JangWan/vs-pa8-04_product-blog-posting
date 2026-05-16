"use client";

import { cn } from "@/lib/utils";

interface RippleProps {
  className?: string;
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
}

/**
 * Magic UI Ripple 인라인 구현체.
 * 실제 Magic UI 설치 시: pnpm dlx shadcn@latest add "https://magicui.design/r/ripple"
 */
export function Ripple({
  className,
  mainCircleSize = 210,
  mainCircleOpacity = 0.24,
  numCircles = 8,
}: RippleProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex items-center justify-center",
        className
      )}
    >
      {Array.from({ length: numCircles }, (_, i) => {
        const size = mainCircleSize + i * 70;
        const opacity = mainCircleOpacity - i * 0.025;
        const animationDelay = `${i * 0.06}s`;
        const borderStyle = i === numCircles - 1 ? "dashed" : "solid";
        const borderOpacity = i === numCircles - 1 ? 0 : opacity;

        return (
          <div
            key={i}
            className="absolute animate-ripple rounded-full border bg-primary/5"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              opacity,
              animationDelay,
              borderStyle,
              borderColor: `rgba(153,209,170,${borderOpacity})`,
              borderWidth: "1px",
            }}
          />
        );
      })}
    </div>
  );
}
