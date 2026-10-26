import { queryOptions } from "@tanstack/react-query";

import { api } from "./client";
import { ApiError } from "./errors";
import type { UserRole } from "./session";

export interface ManagedUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface CreatedUser extends ManagedUser {
  temporaryPassword: string;
}

export interface CreateUserPayload {
  email: string;
  name?: string;
  role?: UserRole;
}

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
};

export async function fetchUsers(): Promise<ManagedUser[]> {
  const res = await api.get<ManagedUser[]>("/users");
  if (!res.data) {
    throw new ApiError("Failed to load users", 500);
  }
  return res.data;
}

export function usersQuery() {
  return queryOptions({
    queryKey: userKeys.lists(),
    queryFn: fetchUsers,
  });
}

export async function createUser(payload: CreateUserPayload): Promise<CreatedUser> {
  const res = await api.post<CreatedUser>("/users", payload);
  if (!res.data) {
    throw new ApiError("Failed to create user", 500);
  }
  return res.data;
}

export async function updateUserRole(id: number, role: UserRole): Promise<ManagedUser> {
  const res = await api.patch<ManagedUser>(`/users/${id}/role`, { role });
  if (!res.data) {
    throw new ApiError("Failed to update user role", 500);
  }
  return res.data;
}

export async function deleteUser(id: number): Promise<void> {
  await api.delete(`/users/${id}`);
}
