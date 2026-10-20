import { type InfiniteData, type QueryKey, useInfiniteQuery } from "@tanstack/react-query";

import { useCallback, useMemo, useRef } from "react";

/** Pagination block an API is expected to return alongside a page of items. */
export interface PaginationMeta {
  /**
   * null in no-count responses, where the API skips COUNT(*) and only reports
   * whether another page exists via hasNextPage / nextPage.
   */
  total: number | null;
  totalPages: number | null;
  page: number;
  limit: number;
  prevPage: number | null;
  nextPage: number | null;
  hasNextPage: boolean;
}

export interface PaginatedMeta {
  pagination?: PaginationMeta;
}

/** One page as returned by the fetcher. */
export interface Page<TItem, TMeta extends PaginatedMeta = PaginatedMeta> {
  data?: TItem[];
  meta?: TMeta;
}

type Options<TItem, TMeta extends PaginatedMeta> = {
  /** Fetches a single page. Throw to let react-query surface the error. */
  fetchPage: (params: { page: number; limit: number }) => Promise<Page<TItem, TMeta>>;
  queryKey: QueryKey;
  pageSize?: number;
  /** Server-rendered or preloaded first page, if you have one. */
  initialData?: Page<TItem, TMeta>;
};

/**
 * Infinite-scroll query. Returns the flattened `items` plus a `loadMoreRef`
 * callback ref — attach it to a sentinel element at the end of the list and the
 * next page loads when it scrolls into view.
 */
export function useInfiniteScrollQuery<
  TItem,
  TElement extends Element = Element,
  TMeta extends PaginatedMeta = PaginatedMeta,
>(params: Options<TItem, TMeta>) {
  const { fetchPage, queryKey, pageSize = 10, initialData } = params;

  type QueryPage = Page<TItem, TMeta>;

  const lazy = useInfiniteQuery<
    QueryPage,
    Error,
    InfiniteData<QueryPage, number>,
    QueryKey,
    number
  >({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage({ page: pageParam, limit: pageSize }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.meta?.pagination?.nextPage ?? null,
    initialData: initialData ? { pages: [initialData], pageParams: [1] } : undefined,
  });

  const observerRef = useRef<IntersectionObserver | null>(null);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = lazy;
  const items = useMemo(
    () => lazy.data?.pages.flatMap((page) => page.data ?? []) ?? [],
    [lazy.data],
  );

  const loadMoreRef = useCallback(
    (node: TElement | null) => {
      observerRef.current?.disconnect();

      if (!node || !hasNextPage || isFetchingNextPage) return;

      observerRef.current = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) fetchNextPage();
      });

      observerRef.current.observe(node);
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  return { ...lazy, items, loadMoreRef };
}
