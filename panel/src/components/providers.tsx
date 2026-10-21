"use client";

import { Direction as DirectionPrimitive, Tooltip as TooltipPrimitive } from "radix-ui";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// DirectionProvider لازم است چون Select/DropdownMenu رادیکس dir را از <html>
// نمی‌خوانند — بدون آن محتوای منوها در RTL جایش اشتباه می‌شود.
// TooltipProvider هم اجباری است: SidebarMenuButton با prop، Tooltip می‌سازد.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <DirectionPrimitive.DirectionProvider dir="rtl">
        <TooltipPrimitive.Provider delayDuration={200}>
          {children}
          <Toaster dir="rtl" position="bottom-left" richColors closeButton />
        </TooltipPrimitive.Provider>
      </DirectionPrimitive.DirectionProvider>
    </ThemeProvider>
  );
}
