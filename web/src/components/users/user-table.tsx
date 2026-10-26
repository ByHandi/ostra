import { UserActions } from "./user-actions";

import { ListGroup, ListRowContent } from "@/components/list-group";
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
import type { CurrentUser } from "@/lib/api/session";
import type { ManagedUser } from "@/lib/api/users";
import { formatDate } from "@/lib/format";
import { listRowClass } from "@/lib/list-row";
import { cn } from "@/lib/utils";

const COLUMNS = ["User", "Role", "Created", ""];

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

interface UserTableProps {
  users: ManagedUser[];
  currentUser?: CurrentUser;
}

export function UserTable({ users, currentUser }: UserTableProps) {
  return (
    <>
      <ListGroup>
        {users.map((u) => {
          const isSelf = currentUser?.id === u.id;
          return (
            <li key={u.id} className="flex items-center">
              <div className={cn(listRowClass, "min-w-0 flex-1")}>
                <ListRowContent
                  icon="user"
                  title={
                    <span className="flex items-center gap-1.5 font-medium">
                      {u.name}
                      {isSelf && (
                        <span className="text-xs font-normal text-muted-foreground">(you)</span>
                      )}
                    </span>
                  }
                  subtitle={u.email}
                  trailing={
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "Admin" : "Viewer"}
                    </Badge>
                  }
                />
              </div>
              <span className="pr-2">
                <UserActions user={u} isSelf={isSelf} />
              </span>
            </li>
          );
        })}
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
            {users.map((u) => {
              const isSelf = currentUser?.id === u.id;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
                        {initials(u.name)}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          {u.name}
                          {isSelf && (
                            <span className="text-xs font-normal text-muted-foreground">(you)</span>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role === "admin" ? "Admin" : "Viewer"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(u.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserActions user={u} isSelf={isSelf} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

UserTable.Skeleton = function UserTableSkeleton() {
  return <TableSkeleton columns={COLUMNS} rows={4} />;
};
