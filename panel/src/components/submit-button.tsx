"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// دکمه‌ی سابمیت فرم سرور-اکشنی — حین ارسال (مثلاً آپلود فایل حجیم) اسپینر می‌زند.
export function SubmitButton({
  children,
  pendingText = "در حال انجام…",
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={cn(className)} {...props}>
      {pending && <Loader2 className="animate-spin" />}
      {pending ? pendingText : children}
    </Button>
  );
}
