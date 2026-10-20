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
import type { Bucket } from "@/lib/api/storage";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";

const COLUMNS = ["Nama", "Objek", "Ukuran", "Custom domain", "Dibuat"];

function BucketTable({ buckets }: { buckets: Bucket[] }) {
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
          {buckets.map((b) => (
            <TableRow key={b.id}>
              <TableCell>
                <Link
                  to="/buckets/$bucketId"
                  params={{ bucketId: b.id }}
                  className="inline-flex items-center gap-2 font-medium hover:underline"
                >
                  <Icon name="archive" className="size-4 text-muted-foreground" />
                  {b.name}
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{formatNumber(b.objects)}</TableCell>
              <TableCell className="tabular-nums">{formatBytes(b.bytes)}</TableCell>
              <TableCell>
                {b.domains.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {b.domains.map((d) => (
                      <Badge key={d} variant="outline">
                        {d}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(b.created)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

BucketTable.Skeleton = () => <TableSkeleton columns={COLUMNS} />;
export default BucketTable;
