import { useQueryClient } from "@tanstack/react-query";

import { useCallback } from "react";

import { objectKeys } from "@/lib/api/objects";
import { storageKeys } from "@/lib/api/storage";

/** Refreshes every folder listing of the bucket plus its size and object counts. */
export function useInvalidateBucketContents(bucketId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: objectKeys.bucket(bucketId) }),
        queryClient.invalidateQueries({ queryKey: storageKeys.bucket(bucketId) }),
        queryClient.invalidateQueries({ queryKey: storageKeys.buckets }),
        queryClient.invalidateQueries({ queryKey: storageKeys.overview }),
      ]),
    [queryClient, bucketId],
  );
}
