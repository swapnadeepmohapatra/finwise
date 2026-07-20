"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/actions/accounts";

/**
 * useActionState wrapper for dialog/sheet forms: shows a toast and runs
 * onSuccess (usually closing the dialog) when the action reports success.
 * Mount the form only while the dialog is open so state resets per open.
 */
export function useActionForm(
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>,
  options: { onSuccess?: () => void; successMessage?: string } = {},
) {
  const [state, formAction, pending] = useActionState(action, {});
  const { onSuccess, successMessage } = options;

  useEffect(() => {
    if (state.success) {
      if (successMessage) toast.success(successMessage);
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per action completion
  }, [state]);

  return { state, formAction, pending };
}
