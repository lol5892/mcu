import { useEffect, useId } from "react";
import { setUpdateBlocker } from "./safety";
export function useUpdateBlocker(reason: string, blocked: boolean) {
  const id = useId();
  useEffect(() => {
    const key = `${reason}:${id}`;
    setUpdateBlocker(key, blocked);
    return () => setUpdateBlocker(key, false);
  }, [id, reason, blocked]);
}
