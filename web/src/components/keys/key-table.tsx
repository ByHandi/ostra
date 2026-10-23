import { Link } from "@tanstack/react-router";

import { KeyActions } from "@/components/keys/key-actions";
import { ListGroup, ListRowContent } from "@/components/list-group";
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
import { listRowClass } from "@/lib/list-row";
import { cn } from "@/lib/utils";

const COLUMNS = ["Name", "Access key ID", "Created", ""];

function KeyTable({ keys }: { keys: AccessKey[] }) {
  return (
    <>
      <ListGroup>
        {keys.map((k) => (
          <li key={k.id} className="flex items-center">
            <Link
              to="/keys/$keyId"
              params={{ keyId: k.id }}
              className={cn(listRowClass, "min-w-0 flex-1")}
            >
              <ListRowContent
                icon="key-round"
                title={k.name || "Unnamed"}
                subtitle={<span className="font-mono">{k.id}</span>}
                trailing={k.expired && <Badge variant="destructive">Expired</Badge>}
                chevron
              />
            </Link>
            <span className="pr-2">
              <KeyActions keyId={k.id} keyName={k.name} />
            </span>
          </li>
        ))}
      </ListGroup>
      <div className="hidden min-h-0 flex-col overflow-hidden panel md:flex">
        <Table scrollable>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead key={c} className={c === "" ? "w-12 text-right" : undefined}>
                  {c}
                </TableHead>
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
                    {k.name || "Unnamed"}
                  </Link>
                  {k.expired && (
                    <Badge variant="destructive" className="ml-2">
                      Expired
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{k.id}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(k.created)}</TableCell>
                <TableCell className="text-right">
                  <KeyActions keyId={k.id} keyName={k.name} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

KeyTable.Skeleton = () => <TableSkeleton columns={COLUMNS} />;
export default KeyTable;
