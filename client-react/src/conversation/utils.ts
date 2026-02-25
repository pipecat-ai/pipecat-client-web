/**
 * Copyright (c) 2024, Daily.
 *
 * SPDX-License-Identifier: BSD-2-Clause
 */

// ES2020-compatible polyfills for findLast / findLastIndex

export function findLastIndex<T>(
  arr: T[],
  predicate: (value: T, index: number, array: T[]) => boolean
): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i], i, arr)) return i;
  }
  return -1;
}

export function findLast<T>(
  arr: T[],
  predicate: (value: T, index: number, array: T[]) => boolean
): T | undefined {
  const idx = findLastIndex(arr, predicate);
  return idx === -1 ? undefined : arr[idx];
}
