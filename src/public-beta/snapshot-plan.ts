export const snapshotTables = {
 family:"mv_families",watchRequests:"mv_watch_requests",members:"mv_members",profile:"mv_profiles",entries:"mv_entries",episodes:"mv_episodes",ratings:"mv_ratings",sessions:"mv_sessions",events:"mv_events",moments:"mv_moments",media:"mv_media",mediaLinks:"mv_media_links",notifications:"mv_notifications",devices:"mv_devices"
} as const;
export type SnapshotKey=keyof typeof snapshotTables;
export const boundedHistory: Partial<Record<SnapshotKey,{column:string;limit:number}>>={
 sessions:{column:"created_at",limit:50},events:{column:"starts_at",limit:100},moments:{column:"created_at",limit:50},notifications:{column:"created_at",limit:50}
};
export function affectedTables(kind:string):SnapshotKey[]{
 const shared:SnapshotKey[]=["entries","episodes","watchRequests","notifications"];
 if(["entry","episode","watch_confirm","watch_cancel","watch_reject"].includes(kind))return shared;
 if(kind==="rating")return ["ratings","notifications"];
 if(kind==="session")return ["sessions","notifications"];
 if(kind.startsWith("moment"))return ["moments","media","mediaLinks","notifications"];
 if(kind==="event")return ["events","notifications"];
 return ["notifications"];
}
export function realtimeFilter(key:SnapshotKey,familyId:string,userId:string){
 return key==="family"?`id=eq.${familyId}`:key==="profile"?`id=eq.${userId}`:key==="devices"?`user_id=eq.${userId}`:key==="notifications"?`recipient_id=eq.${userId}`:`family_id=eq.${familyId}`;
}
