import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/empty-state";
import { TableSkeleton } from "@/components/table-skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BucketKeyAccess } from "@/lib/api/storage";

const COLUMNS = ["Access key", "Permissions"];

/** Read-only: permissions are edited from the key's page, where every bucket is listed. */
function BucketAccess({ keys }: { keys: BucketKeyAccess[] }) {
  if (keys.length === 0) {
    return (
      <EmptyState
        icon="key-round"
        title="No access keys yet"
        description="No key can access this bucket through the S3 API. Grant permissions from the Access Keys page."
      />
    );
  }

  return (
    <div className="panel">
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
            <TableRow key={k.keyId}>
              <TableCell>
                <Link
                  to="/keys/$keyId"
                  params={{ keyId: k.keyId }}
                  className="font-medium hover:underline"
                >
                  {k.keyName || k.keyId}
                </Link>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {k.permissions.read && <Badge variant="secondary">read</Badge>}
                  {k.permissions.write && <Badge variant="secondary">write</Badge>}
                  {k.permissions.owner && <Badge variant="secondary">owner</Badge>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

BucketAccess.Skeleton = () => <TableSkeleton columns={COLUMNS} rows={2} />;
export default BucketAccess;
