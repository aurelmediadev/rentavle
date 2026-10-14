"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/form";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "./actions";

export function AcceptButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="grid gap-3">
      {error && <FormMessage state={{ message: error }} />}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(token);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Aceptando…" : "Aceptar invitación"}
      </Button>
    </div>
  );
}
