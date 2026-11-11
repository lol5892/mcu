import { useEffect, useState } from "react";

// Private local drafts are scoped to the verified account, never exported with
// auth credentials. They survive a UI update without touching the Auth store.
export function usePrivateDraft<T>(key: string, initial: T) {
  const storageKey = "mv-draft-v1:" + key;
  const read = () => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? ({ ...initial, ...JSON.parse(saved) } as T) : initial;
    } catch { return initial; }
  };
  const [value, setValue] = useState<T>(read);
  useEffect(() => { setValue(read()); }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Current form remains usable when storage is full. */ }
  }, [storageKey, value]);
  const clear = () => {
    setValue(initial);
    try { localStorage.removeItem(storageKey); } catch { /* Optional local draft. */ }
  };
  return [value, setValue, clear] as const;
}
