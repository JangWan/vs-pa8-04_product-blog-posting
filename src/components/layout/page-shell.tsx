"use client";

import { motion } from "framer-motion";

interface PageShellProps {
  title: string;
  description: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {description}
          </p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      {children}
    </motion.div>
  );
}
