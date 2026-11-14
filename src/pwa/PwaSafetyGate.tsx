import {retiredCommunication} from "../family/outbox";
import { useFamily } from "../family/FamilyProvider";
import { useUpdateBlocker } from "./useUpdateBlocker";
export function PwaSafetyGate() {
  const f = useFamily();
  useUpdateBlocker("account-loading", !f.ready);
  useUpdateBlocker("sync", f.operations.some(o=>!(o.state==="failed"&&retiredCommunication(o))));
  useUpdateBlocker("watching-together", f.snapshot.sessions.some(s => s.status === "active"));
  return null;
}
