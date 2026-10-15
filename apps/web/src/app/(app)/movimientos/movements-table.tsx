import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates";
import { clientName, formatAddress } from "@/lib/format";
import { formatMoney } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import type { listMovements } from "./data";
import { MOVEMENT_TYPE, PAYMENT_METHOD } from "./labels";

export function MovementsTable({ rows }: { rows: Awaited<ReturnType<typeof listMovements>> }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="hidden md:table-cell">Contrato</TableHead>
            <TableHead className="hidden lg:table-cell">Forma</TableHead>
            <TableHead className="text-right">Monto</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ movement, contractNumber, property, client }) => (
            <TableRow key={movement.id} className={cn("relative", movement.reversedAt && "text-muted-foreground")}>
              <TableCell>{movement.number}</TableCell>
              <TableCell>{formatDate(movement.date)}</TableCell>
              <TableCell className="font-medium">
                <Link href={`/movimientos/${movement.number}`} className="after:absolute after:inset-0">
                  {MOVEMENT_TYPE[movement.type]}
                  {client?.kind && ` · ${clientName(client as Parameters<typeof clientName>[0])}`}
                </Link>{" "}
                {movement.reversedAt && <Badge variant="outline">Anulado</Badge>}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {contractNumber ? `#${contractNumber} · ${formatAddress(property as Parameters<typeof formatAddress>[0])}` : "—"}
              </TableCell>
              <TableCell className="hidden lg:table-cell">{PAYMENT_METHOD[movement.method]}</TableCell>
              <TableCell className={cn("text-right tabular-nums", movement.reversedAt && "line-through")}>
                {formatMoney(movement.amount, movement.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
