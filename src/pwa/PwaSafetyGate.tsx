import { useFamily } from "../family/FamilyProvider";
import { useUpdateBlocker } from "./useUpdateBlocker";
export function PwaSafetyGate() {
  const f = useFamily();
  useUpdateBlocker("account-loading", !f.ready);
  useUpdateBlocker("sync", f.operations.length > 0);
  useUpdateBlocker("watching-together", f.snapshot.sessions.some(s => s.status === "active"));
  return null;
}
