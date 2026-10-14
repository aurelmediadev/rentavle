"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removeMember, revokeInvitation } from "./actions";

export function RevokeInvitationButton({ invitationId }: { invitationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => revokeInvitation(invitationId))}
    >
      Anular
    </Button>
  );
}

export function RemoveMemberButton({ membershipId }: { membershipId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("¿Quitar a este usuario de la inmobiliaria?")) return;
        startTransition(async () => {
          const result = await removeMember(membershipId);
          if (result.error) toast.error(result.error);
        });
      }}
    >
      Quitar
    </Button>
  );
}
