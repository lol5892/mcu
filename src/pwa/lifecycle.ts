import { updateBlocked } from "./safety";

/** The page keeps its version until all mounted clients can safely restart. */
export function startPwaUpdates(base: string, idleMs = 2500) {
  if (!("serviceWorker" in navigator)) return;
  const clientVersion = document.querySelector<HTMLMetaElement>('meta[name="mv-build"]')?.content || "legacy";
  const dirty = new Set<HTMLInputElement | HTMLTextAreaElement | HTMLElement>();
  let lastInteraction = Date.now();
  let registration: ServiceWorkerRegistration | undefined;
  let checking = false;
  let activating = false;
  let controllerVersion = "";
  let reloading = false;
  let lastCheck = 0;
  const value = (el: HTMLElement) => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent;
  const interact = () => { lastInteraction = Date.now(); };
  const input = (event: Event) => {
    interact();
    const el = event.target;
    if (!(el instanceof HTMLElement)) return;
    if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !["checkbox", "radio", "range", "button", "submit", "hidden"].includes(el.type)) || el.isContentEditable) {
      if (value(el)) dirty.add(el); else dirty.delete(el);
    }
  };
  const safe = () => {
    for (const el of dirty) if (!el.isConnected || !value(el)) dirty.delete(el);
    // Even hidden clients must acknowledge drafts; one tab cannot destroy another's work.
    return navigator.onLine && !updateBlocked() && !dirty.size && Date.now() - lastInteraction >= idleMs;
  };
  const reportVersion = () => navigator.serviceWorker.controller?.postMessage({type:"MV_CLIENT_VERSION", version:clientVersion});
  const readController = () => navigator.serviceWorker.controller?.postMessage({type:"MV_GET_VERSION"});
  const reloadIfSafe = () => {
    if (!controllerVersion || controllerVersion === clientVersion || reloading || !safe() || document.visibilityState !== "visible") return;
    // A bad deployment must never cause a reload loop. A later worker has another key.
    const key = `mv-reloaded:${controllerVersion}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { return; } // Storage unavailable: retain the working UI rather than loop.
    reloading = true;
    location.reload();
  };
  const activateWhenSafe = () => {
    if (registration?.waiting && !activating && safe() && document.visibilityState === "visible") {
      activating = true;
      registration.waiting.postMessage({type:"MV_ACTIVATE"});
      window.setTimeout(() => { activating = false; }, 3500);
    }
    reloadIfSafe();
  };
  const watch = (worker: ServiceWorker | null) => {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") activateWhenSafe();
      if (worker.state === "activated") readController();
    });
  };
  const check = async (force = false) => {
    if (!registration || checking || !navigator.onLine || document.visibilityState !== "visible") return;
    if (!force && Date.now() - lastCheck < 30000) { activateWhenSafe(); return; }
    lastCheck = Date.now(); checking = true;
    try { await registration.update(); watch(registration.installing); activateWhenSafe(); }
    catch { /* Keep the complete current offline shell; retry on foreground/online. */ }
    finally { checking = false; }
  };
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "MV_PREPARE" && event.source) {
      (event.source as ServiceWorker).postMessage({type:"MV_SAFE", nonce:data.nonce, safe:safe(), version:clientVersion});
    } else if (data.type === "MV_VERSION" && typeof data.version === "string") {
      controllerVersion = data.version;
      reportVersion(); reloadIfSafe();
    } else if (data.type === "MV_ACTIVATION_DEFERRED") activating = false;
    else if (data.type === "MV_VERSION_QUERY") reportVersion();
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    activating = false; readController();
  });
  for (const name of ["pointerdown", "keydown", "change"] as const) document.addEventListener(name, interact, {capture:true, passive:true});
  document.addEventListener("input", input, true);
  document.addEventListener("change", input, true);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { void check(true); readController(); }
  });
  window.addEventListener("pageshow", () => { void check(true); readController(); });
  window.addEventListener("online", () => { void check(true); });
  window.addEventListener("mv-update-safety", activateWhenSafe);
  window.setInterval(activateWhenSafe, 1000);
  window.setInterval(() => { void check(); }, 60000);
  void navigator.serviceWorker.register(`${base}sw.js`, {scope:base, updateViaCache:"none"})
    .then(r => {
      registration = r;
      r.addEventListener("updatefound", () => watch(r.installing));
      watch(r.installing); readController(); void check(true); activateWhenSafe();
      // A release can arrive during the initial registration/update request.
      window.setTimeout(() => void check(true), 3000);
    })
    .catch(() => window.dispatchEvent(new Event("sw-error")));
}
