"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface TypingAnimationProps {
  text: string;
  duration?: number;
  className?: string;
}

/**
 * Magic UI TypingAnimation 인라인 구현체.
 * 실제 Magic UI 설치 시: pnpm dlx shadcn@latest add "https://magicui.design/r/typing-animation"
 */
export function TypingAnimation({
  text,
  duration = 60,
  className,
}: TypingAnimationProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText((prev) => prev + text[index]);
        setIndex((prev) => prev + 1);
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [index, text, duration]);

  return (
    <span className={cn("inline-block", className)}>
      {displayedText}
      {index < text.length && (
        <span className="animate-pulse text-primary">|</span>
      )}
    </span>
  );
}
