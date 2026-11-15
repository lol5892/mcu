import type { Snapshot, Role } from "../family/types";
export function slotName(s: Snapshot, role: Role) {
  return (
    s.members.find((m) => m.role === role)?.display_name ||
    (role === "anton" ? "Первый участник" : "Партнёр")
  );
}
export function memberName(s: Snapshot, id: string) {
  return s.members.find((m) => m.user_id === id)?.display_name || "Участник";
}
export function pairName(s: Snapshot) {
  return s.members.length === 2
    ? s.members.map((m) => m.display_name || "Участник").join(" + ")
    : s.family?.name || "Ваша киновселенная";
}
