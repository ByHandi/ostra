import { ListGroupSkeleton } from "@/components/list-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  /** Column headers, so the skeleton keeps the real table's shape. */
  columns: string[];
  rows?: number;
}

/**
 * Shared building block for the per-feature table skeletons (BucketTable.Skeleton,
 * DomainTable.Skeleton, …). Real headers render immediately; only cells pulse. Phones get
 * the list-row shape instead, matching what the tables turn into there.
 */
export function TableSkeleton({ columns, rows = 4 }: TableSkeletonProps) {
  return (
    <div role="status" aria-label="Loading" className="md:flex md:min-h-0 md:flex-col">
      <ListGroupSkeleton rows={rows} />
      <div className="hidden min-h-0 flex-col overflow-hidden panel md:flex">
        <Table scrollable>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }, (_, r) => (
              <TableRow key={r}>
                {columns.map((c, i) => (
                  <TableCell key={c}>
                    <Skeleton className={i === 0 ? "h-4 w-40" : "h-4 w-20"} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
