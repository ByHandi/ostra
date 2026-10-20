import { Link } from "@tanstack/react-router";

import { TableSkeleton } from "@/components/table-skeleton";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AccessKey } from "@/lib/api/storage";
import { formatDate } from "@/lib/format";

const COLUMNS = ["Nama", "Access key ID", "Dibuat"];

function KeyTable({ keys }: { keys: AccessKey[] }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((k) => (
            <TableRow key={k.id}>
              <TableCell>
                <Link
                  to="/keys/$keyId"
                  params={{ keyId: k.id }}
                  className="inline-flex items-center gap-2 font-medium hover:underline"
                >
                  <Icon name="key-round" className="size-4 text-muted-foreground" />
                  {k.name || "Tanpa nama"}
                </Link>
                {k.expired && (
                  <Badge variant="destructive" className="ml-2">
                    Kedaluwarsa
                  </Badge>
                )}
              </TableCell>
              <TableCell className="font-mono text-xs">{k.id}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(k.created)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

KeyTable.Skeleton = () => <TableSkeleton columns={COLUMNS} />;
export default KeyTable;
