import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import AppHeader from "@/components/app-header";
import { EmptyState } from "@/components/empty-state";
import { QueryError } from "@/components/query-error";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { UserTable } from "@/components/users/user-table";
import { sessionContextQuery } from "@/lib/api/session";
import { usersQuery } from "@/lib/api/users";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/(app)/users/")({
  head: () => pageMeta("Users", "Manage dashboard user accounts and assign admin or viewer roles."),
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionContextQuery());
    if (session.user.role !== "admin") {
      throw redirect({ to: "/" });
    }
  },
  component: UsersPage,
});

function UsersPage() {
  const users = useQuery(usersQuery());
  const session = useQuery(sessionContextQuery());
  const currentUser = session.data?.user;

  return (
    <>
      <AppHeader
        title="Users"
        description="Manage dashboard user accounts and assign admin or viewer roles."
        endContent={<CreateUserDialog />}
      />

      <div className="p-4 md:flex md:flex-col md:p-6">
        {users.isPending ? (
          <UserTable.Skeleton />
        ) : users.isError ? (
          <QueryError error={users.error} onRetry={() => users.refetch()} />
        ) : users.data.length === 0 ? (
          <EmptyState
            icon="users"
            title="No users found"
            description="Create an account to invite additional operators to the dashboard."
            action={<CreateUserDialog />}
          />
        ) : (
          <UserTable users={users.data} currentUser={currentUser} />
        )}
      </div>
    </>
  );
}
