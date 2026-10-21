"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// بلوک کد با دکمه‌ی کپی — متن‌هایی که کاربر باید آن‌سرور بچسباند.
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // http لوکال clipboard API ندارد؛ روش قدیمی:
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    toast.success(label ? `«${label}» کپی شد` : "کپی شد");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="group relative">
      <pre
        dir="ltr"
        className="max-h-96 overflow-auto rounded-lg bg-muted/60 p-3 pe-12 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap"
      >
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={copy}
        aria-label="کپی"
        className="absolute top-1.5 end-1.5 text-muted-foreground hover:text-foreground"
      >
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </Button>
    </div>
  );
}
