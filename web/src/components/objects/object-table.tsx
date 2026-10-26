import { Link } from "@tanstack/react-router";

import { FileActions, FolderActions } from "./object-actions";

import { ListGroup, ListRowContent } from "@/components/list-group";
import { TableSkeleton } from "@/components/table-skeleton";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SortBy, SortOrder, StoredObject } from "@/lib/api/objects";
import { formatBytes, formatDate } from "@/lib/format";
import { listRowClass } from "@/lib/list-row";
import { baseName } from "@/lib/object-path";
import { cn } from "@/lib/utils";

const COLUMNS = ["Name", "Size", "Last modified", ""];

interface ObjectTableProps {
  bucketId: string;
  folders: string[];
  objects: StoredObject[];
  publicBaseUrl: string;
  sortBy?: SortBy;
  order?: SortOrder;
  onSortChange?(sortBy: SortBy, order: SortOrder): void;
}

interface SortHeaderProps {
  label: string;
  column: SortBy;
  currentSort: SortBy;
  currentOrder: SortOrder;
  onSort(column: SortBy): void;
}

function SortHeader({ label, column, currentSort, currentOrder, onSort }: SortHeaderProps) {
  const active = currentSort === column;
  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1.5 font-medium select-none hover:text-foreground"
      onClick={() => onSort(column)}
    >
      {label}
      {active ? (
        <Icon
          name={currentOrder === "asc" ? "arrow-up" : "arrow-down"}
          className="size-3.5 text-primary"
        />
      ) : (
        <Icon name="arrow-up-down" className="size-3 text-muted-foreground/60" />
      )}
    </button>
  );
}

function MobileSortBar({
  sortBy,
  order,
  onSort,
}: {
  sortBy: SortBy;
  order: SortOrder;
  onSort(column: SortBy): void;
}) {
  const columns: { label: string; column: SortBy }[] = [
    { label: "Name", column: "name" },
    { label: "Size", column: "size" },
    { label: "Date", column: "lastModified" },
  ];

  return (
    <li className="flex items-center justify-between border-b bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground md:hidden">
      <span className="font-medium">Sort:</span>
      <div className="flex items-center gap-1">
        {columns.map(({ label, column }) => {
          const active = sortBy === column;
          return (
            <Button
              key={column}
              type="button"
              variant={active ? "secondary" : "ghost"}
              size="xs"
              onClick={() => onSort(column)}
            >
              {label}
              {active && (
                <Icon name={order === "asc" ? "arrow-up" : "arrow-down"} className="size-3" />
              )}
            </Button>
          );
        })}
      </div>
    </li>
  );
}

function ObjectTable({
  bucketId,
  folders,
  objects,
  publicBaseUrl,
  sortBy = "name",
  order = "asc",
  onSortChange,
}: ObjectTableProps) {
  const handleSort = (col: SortBy) => {
    if (!onSortChange) return;
    if (sortBy === col) {
      onSortChange(col, order === "asc" ? "desc" : "asc");
    } else {
      onSortChange(col, col === "name" ? "asc" : "desc");
    }
  };

  return (
    <>
      <ListGroup>
        <MobileSortBar sortBy={sortBy} order={order} onSort={handleSort} />
        {folders.map((prefix) => (
          <li key={prefix} className="flex items-center">
            <Link
              to="/buckets/$bucketId/files"
              params={{ bucketId }}
              search={(prev) => ({ ...prev, prefix, search: undefined })}
              className={cn(listRowClass, "min-w-0 flex-1")}
            >
              <ListRowContent icon="folder" title={baseName(prefix)} subtitle="Folder" chevron />
            </Link>
            <span className="pr-2">
              <FolderActions bucketId={bucketId} prefix={prefix} name={baseName(prefix)} />
            </span>
          </li>
        ))}
        {objects.map((o) => (
          <li key={o.key} className="flex min-h-14 items-center gap-3 py-2.5 pr-2 pl-3">
            <ListRowContent
              icon="file"
              title={baseName(o.key)}
              subtitle={`${formatBytes(o.size)} · ${formatDate(o.lastModified)}`}
              trailing={
                <FileActions
                  bucketId={bucketId}
                  objectKey={o.key}
                  name={baseName(o.key)}
                  publicBaseUrl={publicBaseUrl}
                  contentType={o.contentType}
                />
              }
            />
          </li>
        ))}
      </ListGroup>
      <div className="hidden min-h-0 flex-col overflow-hidden panel md:flex">
        <Table scrollable>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader
                  label="Name"
                  column="name"
                  currentSort={sortBy}
                  currentOrder={order}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label="Size"
                  column="size"
                  currentSort={sortBy}
                  currentOrder={order}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label="Last modified"
                  column="lastModified"
                  currentSort={sortBy}
                  currentOrder={order}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {folders.map((prefix) => (
              <TableRow key={prefix}>
                <TableCell>
                  <Link
                    to="/buckets/$bucketId/files"
                    params={{ bucketId }}
                    search={(prev) => ({ ...prev, prefix, search: undefined })}
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
                <TableCell className="text-muted-foreground">
                  {formatDate(o.lastModified)}
                </TableCell>
                <TableCell>
                  <FileActions
                    bucketId={bucketId}
                    objectKey={o.key}
                    name={baseName(o.key)}
                    publicBaseUrl={publicBaseUrl}
                    contentType={o.contentType}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

ObjectTable.Skeleton = () => <TableSkeleton columns={COLUMNS} rows={5} />;
export default ObjectTable;
