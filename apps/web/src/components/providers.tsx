"use client";

import { Toaster } from "@test-evals/ui/components/sonner";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system">
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
