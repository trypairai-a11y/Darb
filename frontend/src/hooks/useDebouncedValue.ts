import { useEffect, useState } from "react";

/**
 * The value, held back until it has stopped changing for `delayMs`.
 *
 * Revision 24 #12: a search box wired straight into a query key starts a new
 * query on every keystroke. Keep the input controlled by the live value and
 * feed the query this one instead.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
