import { Link } from "@tanstack/react-router";

import { FileActions, FolderActions } from "./object-actions";

import { TableSkeleton } from "@/components/table-skeleton";
import Icon from "@/components/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StoredObject } from "@/lib/api/objects";
import { formatBytes, formatDate } from "@/lib/format";
import { baseName } from "@/lib/object-path";

const COLUMNS = ["Name", "Size", "Last modified", ""];

interface ObjectTableProps {
  bucketId: string;
  folders: string[];
  objects: StoredObject[];
  publicBaseUrl: string;
}

function ObjectTable({ bucketId, folders, objects, publicBaseUrl }: ObjectTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c} className={c === "" ? "w-12" : undefined}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {folders.map((prefix) => (
            <TableRow key={prefix}>
              <TableCell>
                <Link
                  to="/buckets/$bucketId/files"
                  params={{ bucketId }}
                  search={{ prefix }}
                  className="inline-flex items-center gap-2 font-medium hover:underline"
                >
                  <Icon name="folder" className="size-4 text-muted-foreground" />
                  {baseName(prefix)}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">—</TableCell>
              <TableCell className="text-muted-foreground">—</TableCell>
              <TableCell>
                <FolderActions bucketId={bucketId} prefix={prefix} name={baseName(prefix)} />
              </TableCell>
            </TableRow>
          ))}
          {objects.map((o) => (
            <TableRow key={o.key}>
              <TableCell>
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Icon name="file" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={o.key}>
                    {baseName(o.key)}
                  </span>
                </span>
              </TableCell>
              <TableCell className="tabular-nums">{formatBytes(o.size)}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(o.lastModified)}</TableCell>
              <TableCell>
                <FileActions
                  bucketId={bucketId}
                  objectKey={o.key}
                  name={baseName(o.key)}
                  publicBaseUrl={publicBaseUrl}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

ObjectTable.Skeleton = () => <TableSkeleton columns={COLUMNS} rows={5} />;
export default ObjectTable;
