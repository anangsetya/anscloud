'use client';

import { useEffect, useState, useCallback } from 'react';

/**
 * useApiClient — tiny wrapper around fetch that:
 *   - always sets JSON content-type for POST/PATCH/DELETE with body
 *   - throws on non-2xx with the server-provided error message
 *   - returns parsed JSON or null for empty responses
 */
export function useApiClient() {
  return useCallback(async <T,>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const method = (options.method ?? 'GET').toUpperCase();
    const hasBody = options.body !== undefined && options.body !== null;

    const res = await fetch(url, {
      ...options,
      method,
      headers: {
        ...(hasBody && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(options.headers ?? {}),
      },
    });

    if (!res.ok) {
      let msg = `Request gagal (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) msg = body.error;
      } catch {
        // ignore parse error
      }
      throw new Error(msg);
    }

    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (null as T);
  }, []);
}

/**
 * useStorageSummary — fetch aggregate storage overview, with refetch.
 */
export function useStorageSummary() {
  const [data, setData] = useState<{
    aggregate: {
      totalBytes: string;
      usedBytes: string;
      freeBytes: string;
      usedPct: number;
      accountCount: number;
      totalBytesFormatted: string;
      usedBytesFormatted: string;
      freeBytesFormatted: string;
    };
    accounts: Array<{
      id: string;
      email: string;
      displayName: string;
      avatarColor: string;
      totalBytes: string;
      usedBytes: string;
      freeBytes: string;
      usedPct: number;
      totalBytesFormatted: string;
      usedBytesFormatted: string;
      freeBytesFormatted: string;
      fileCount: number;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/storage-summary');
      if (!res.ok) throw new Error('Gagal memuat ringkasan storage');
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}
