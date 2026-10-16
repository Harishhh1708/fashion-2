// Guest mode: there are no accounts. Everything is saved in this browser (see account.js).
export const GUEST = { uid: "local", email: "", displayName: "" };
export const configured = false;
export function requireAuth(cb) { Promise.resolve().then(() => cb(GUEST)); }
export function setupBanner() {}
export function showMsg(el, text, kind = "error") { el.textContent = text; el.className = "msg " + kind; el.hidden = !text; }
export function busy(btn, on, label) { btn.disabled = on; btn.dataset.l = btn.dataset.l || btn.textContent; btn.textContent = on ? label : btn.dataset.l; }
