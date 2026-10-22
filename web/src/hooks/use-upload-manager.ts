import { createContext, useContext } from "react";

export interface UploadManager {
  start(bucketId: string, files: FileList | File[], prefix: string): void;
  cancel(id: number): void;
  clearFinished(): void;
}

export const UploadManagerContext = createContext<UploadManager | null>(null);

export function useUploadManager(): UploadManager {
  const manager = useContext(UploadManagerContext);
  if (!manager) throw new Error("useUploadManager must be used within UploadManagerProvider");
  return manager;
}
