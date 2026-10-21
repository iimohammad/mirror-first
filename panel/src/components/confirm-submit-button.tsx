"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

// دکمه‌ی ارسال فرم سرور-اکشنی با دیالوگ تأیید. formId را بده تا بعد از تأیید،
// همان فرم (که id/repo و… را در hidden input دارد) از داخل پورتال سابمیت شود.
export function ConfirmSubmitButton({
  title,
  confirmText,
  formId,
  children,
  variant = "outline",
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type"> & {
  title: string;
  confirmText: string;
  formId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} className={className} {...props}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmText}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>انصراف</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            type="submit"
            form={formId}
            onClick={() => setOpen(false)}
          >
            تأیید
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
