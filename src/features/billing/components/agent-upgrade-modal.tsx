"use client";

import Link from "next/link";
import { Zap, Bot } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
}

// H-07: Free 플랜 사용자가 Agent 기능 사용 시 노출하는 업그레이드 유도 모달
export function AgentUpgradeModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto mb-2">
            <Bot className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Agent는 유료 플랜 전용입니다</DialogTitle>
          <DialogDescription className="text-center">
            AI Agent를 사용하려면 Pro 이상 플랜이 필요합니다.
            Pro 플랜은 Agent 30회/월, MAX 플랜은 120회/월을 제공합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pro</span>
            <span className="font-medium">Agent 30회/월 · ₩29,000</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">MAX</span>
            <span className="font-medium">Agent 120회/월 · ₩58,000</span>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full gap-1.5" onClick={onClose}>
            <Link href="/billing/checkout?plan=pro">
              <Zap className="h-4 w-4" />
              Pro 플랜으로 업그레이드
            </Link>
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            나중에
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
