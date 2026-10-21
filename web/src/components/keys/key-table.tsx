import { Link } from "@tanstack/react-router";

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

const COLUMNS = ["Name", "Access key ID", "Created"];

function KeyTable({ keys }: { keys: AccessKey[] }) {
  return (
    <>
      <ListGroup>
        {keys.map((k) => (
          <li key={k.id}>
            <Link to="/keys/$keyId" params={{ keyId: k.id }} className={listRowClass}>
              <ListRowContent
                icon="key-round"
                title={k.name || "Unnamed"}
                subtitle={<span className="font-mono">{k.id}</span>}
                trailing={k.expired && <Badge variant="destructive">Expired</Badge>}
                chevron
              />
            </Link>
          </li>
        ))}
      </ListGroup>
      <div className="hidden min-h-0 flex-col overflow-hidden panel md:flex">
        <Table scrollable>
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
