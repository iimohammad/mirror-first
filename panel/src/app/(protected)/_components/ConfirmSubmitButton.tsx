"use client";

// تنها بخش کلاینتی این صفحات — بقیه‌ی صفحه سرور کامپوننت ساده می‌ماند.
export function ConfirmSubmitButton({
  confirmText,
  children,
  className,
}: {
  confirmText: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
