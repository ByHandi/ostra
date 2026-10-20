import { Link } from "@tanstack/react-router";

import { DomainStatusBadge } from "./domain-status-badge";

import { TableSkeleton } from "@/components/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Domain } from "@/lib/api/storage";
import { formatRelative } from "@/lib/format";

const COLUMNS = ["Domain", "Bucket", "Status", "Last checked"];

interface DomainTableProps {
  domains: Domain[];
  /** Hide the bucket column when the table already sits on a bucket's page. */
  hideBucket?: boolean;
}

function DomainTable({ domains, hideBucket = false }: DomainTableProps) {
  const columns = hideBucket ? COLUMNS.filter((c) => c !== "Bucket") : COLUMNS;

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {domains.map((d) => (
            <TableRow key={d.id}>
              <TableCell>
                <Link
                  to="/domains/$domainId"
                  params={{ domainId: d.id }}
                  className="font-medium hover:underline"
                >
                  {d.domain}
                </Link>
              </TableCell>
              {!hideBucket && (
                <TableCell>
                  <Link
                    to="/buckets/$bucketId"
                    params={{ bucketId: d.bucketId }}
                    className="text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {d.bucketName}
                  </Link>
                </TableCell>
              )}
              <TableCell>
                <DomainStatusBadge status={d.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatRelative(d.lastCheckedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

DomainTable.Skeleton = ({ rows }: { rows?: number }) => (
  <TableSkeleton columns={COLUMNS} rows={rows} />
);
export default DomainTable;
