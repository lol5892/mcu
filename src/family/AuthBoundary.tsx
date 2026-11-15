import { useState, type ReactNode } from "react";
import { Clapperboard, Link, ArrowRight, ShieldCheck } from "lucide-react";
import { useFamily } from "./FamilyProvider";
import { supabase, appURL, errorText } from "./client";
import { authReady } from "../public-beta/config";
import { InstallHelp } from "../public-beta/Help";
import "../public-beta/beta.css";
const incoming = location.hash.match(/^#\/join\/([a-f0-9]{64})$/i)?.[1];
if (incoming) {
  localStorage.setItem("kv-pending-invite", JSON.stringify({ token: incoming, expires: Date.now() + 15 * 60000 }));
  history.replaceState(null, "", location.pathname + location.search);
}
function pendingInvite() {
  try { const i = JSON.parse(localStorage.getItem("kv-pending-invite") || "null"); return i?.expires > Date.now() ? String(i.token) : ""; } catch { return ""; }
}
export function AuthBoundary({ children }: { children: ReactNode }) {
  const f = useFamily();
  const [mode, setMode] = useState<"start" | "create" | "join">(pendingInvite() ? "join" : sessionStorage.getItem("kv-intent") === "create" ? "create" : sessionStorage.getItem("kv-intent") === "join" ? "join" : "start");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [otp, setOTP] = useState(""), [sent, setSent] = useState(false), [passwordMode, setPasswordMode] = useState(false);
  const [name, setName] = useState(""), [familyName, setFamilyName] = useState(""), [secret, setSecret] = useState(pendingInvite), [preview, setPreview] = useState<{inviter:string;family_name:string}|null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function run(work: () => Promise<void>) { setBusy(true); setMessage(""); try { await work(); } catch(e) { setMessage(errorText(e)); } finally { setBusy(false); } }
  if (f.localMode && sessionStorage.getItem("kv-local-preview") === "yes") return <>{children}</>;
  if (f.user && !f.ready) return <main className="auth-page"><p role="status">Открываем вашу вселенную…</p></main>;
  if (f.user && f.familyId) return <>{children}</>;
  return <main className="auth-page beta-onboarding"><section className="auth-card">
    <div className="brand">КИНО <b>ВДВОЁМ</b></div><p className="eyebrow">ЗАКРЫТАЯ БЕТА · БЕСПЛАТНО</p>
    <Clapperboard size={40} aria-hidden="true" />
    <h1>Создайте вашу маленькую киновселенную</h1>
    <p>Смотрите фильмы вместе, ставьте оценки, собирайте достижения и сохраняйте воспоминания.</p>
    {mode === "start" ? <div className="beta-actions"><button className="primary" onClick={() => {sessionStorage.setItem("kv-intent","create");setMode("create");}}>Создать нашу вселенную <ArrowRight size={18}/></button><button className="wide-button" onClick={() => {sessionStorage.setItem("kv-intent","join");setMode("join");}}><Link size={18}/>Присоединиться к партнёру</button></div> : <>
      <button className="text-button" onClick={() => {setMode("start");setPreview(null);}}>Назад</button>
      {!f.user ? <form onSubmit={e => {e.preventDefault();void run(async () => {
        if (!supabase || !authReady) throw Error("Регистрация стенда ещё закрыта. Сначала нужно настроить и проверить почтовую доставку.");
        if (passwordMode) { const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;setPassword(""); }
        else if(sent) { const {error}=await supabase.auth.verifyOtp({email,token:otp.trim(),type:"email"});if(error)throw error; }
        else { const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:appURL(),shouldCreateUser:true}});if(error)throw error;setSent(true);setMessage("Проверьте почту и введите код. Приглашение действует 15 минут; при необходимости партнёр создаст новое."); }
      });}}>
        <label>Ваш email<input aria-label="Email для входа" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value.trim())}/></label>
        {passwordMode && <label>Пароль<input aria-label="Пароль для входа" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/></label>}
        {sent && !passwordMode && <label>Код из письма<input aria-label="Код подтверждения" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={12} value={otp} onChange={e=>setOTP(e.target.value)}/></label>}
        <button className="primary" disabled={busy || !authReady || !supabase}>{busy ? "Подождите…" : passwordMode ? "Войти по паролю" : sent ? "Подтвердить email" : "Получить письмо для входа"}</button>
        <button className="text-button" type="button" onClick={()=>{setPasswordMode(!passwordMode);setSent(false);setMessage("");}}>{passwordMode ? "Войти по письму" : "Войти по паролю"}</button>
        <button className="text-button" type="button" disabled={busy || !authReady} onClick={()=>void run(async()=>{if(!supabase || !email)throw Error("Укажите email.");const {error}=await supabase.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:appURL()}});if(error)throw error;setPasswordMode(false);setSent(true);setMessage("Если аккаунт существует, придёт письмо для восстановления входа. После входа задайте новый пароль в настройках.");})}>Восстановить доступ</button>
      </form> : <form onSubmit={e=>{e.preventDefault();void run(async()=>{
        if(mode === "create") { await f.rpc("kv_create_pair",{p_name:name,p_family_name:familyName}); }
        else { const d=await f.rpc<{ok:boolean;error?:string;inviter:string;family_name:string}>("kv_pair_invitation",{p_secret:secret,p_accept:Boolean(preview),p_name:name});if(!d.ok)throw Error(d.error);if(!preview){setPreview(d);return;}localStorage.removeItem("kv-pending-invite"); }
        await f.refresh();location.hash="/preferences";
      });}}>
        <p className="privacy-line"><ShieldCheck size={16}/>Ваше пространство доступно только вашей паре.</p>
        <label>Ваше имя<input aria-label="Ваше имя" autoComplete="given-name" required maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label>
        {mode === "create" ? <label>Название вселенной · необязательно<input aria-label="Название вселенной" maxLength={100} value={familyName} onChange={e=>setFamilyName(e.target.value)}/></label> : <label>Код или ссылка приглашения<input aria-label="Код приглашения" required maxLength={500} value={secret} onChange={e=>{const t=e.target.value;setSecret(t.match(/#\/join\/([a-f0-9]{64})/i)?.[1] || t);setPreview(null);}}/></label>}
        {preview && <div className="panel"><strong>{preview.inviter} приглашает вас</strong><p>{preview.family_name}</p><p>Подключиться к этой вселенной? После подтверждения ваши просмотры станут общими, оценки и впечатления останутся личными.</p></div>}
        <button className="primary" disabled={busy || f.offline}>{busy ? "Подождите…" : mode === "create" ? "Создать нашу вселенную" : preview ? "Подтвердить подключение" : "Проверить приглашение"}</button>
        <button className="text-button" type="button" onClick={()=>void run(f.signOut)}>Выйти из аккаунта</button>
      </form>}
    </>}
    {!authReady && <p className="beta-notice" role="status">Технический предпросмотр. Набор участников и почтовый вход ещё не открыты. Личные данные исходной семьи здесь отсутствуют.</p>}
    {(message || f.error) && <p className="auth-message" role="status">{message || f.error}</p>}
    {!f.user && <button className="text-button" onClick={()=>{sessionStorage.setItem("kv-local-preview","yes");f.setLocalMode(true);}}>Посмотреть локальный каталог без регистрации</button>}
    <InstallHelp compact/>
    <small>Независимый фанатский дневник. Не связан с Marvel Studios или Disney. Правовой статус графики проверяется до публичного запуска.</small>
  </section></main>;
}
