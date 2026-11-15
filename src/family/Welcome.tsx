import { useState, type ReactNode } from "react";
import { useFamily } from "./FamilyProvider";
import { HelpTour } from "../public-beta/Help";
export function WelcomeLetter({onDone}:{onDone:()=>void}) { return <HelpTour onDone={onDone}/>; }
export function Onboarding({onDone}:{onDone:()=>void;onNotifications?:()=>void}) { return <HelpTour onDone={onDone}/>; }
export function WelcomeGate({children}:{children:ReactNode}) {
 const f=useFamily();const [dismissed,setDismissed]=useState(false),[error,setError]=useState("");
 if(f.familyId && !f.localMode && f.snapshot.profile && !f.snapshot.profile.onboarding_seen_at && !dismissed) return <><HelpTour onDone={()=>{setDismissed(true);void f.rpc("mv_update_profile",{p:{onboarding_seen:true}}).then(f.refresh).catch(()=>setError("Не удалось сохранить завершение обучения. Повторим при следующем входе."));}}/>{error && <p role="status">{error}</p>}</>;
 return <>{children}</>;
}
