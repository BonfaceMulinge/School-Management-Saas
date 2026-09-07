"use client";

import { toast } from "@/components/ui/toast";

type ToastOptions = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  timeout?: number;
};

function success(options: ToastOptions) {
  toast.add({ ...options, type: "success" });
}

function error(options: ToastOptions) {
  toast.add({ ...options, type: "error" });
}

function info(options: ToastOptions) {
  toast.add({ ...options, type: "info" });
}

function warning(options: ToastOptions) {
  toast.add({ ...options, type: "warning" });
}

function dismiss(id?: string) {
  toast.close(id);
}

export { toast, success, error, info, warning, dismiss };
