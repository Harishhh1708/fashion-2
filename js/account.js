// Local storage backend. Projects and profile live in this browser only, so a backup export is provided in Settings.
const KEY = "fc-local-v1";
function read() { try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d && typeof d === "object") return { profile: d.profile || {}, projects: d.projects || {} }; } catch (e) {} return { profile: {}, projects: {} }; }
function write(d) { localStorage.setItem(KEY, JSON.stringify({ v: 1, profile: d.profile, projects: d.projects })); }
const newId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => Date.now();

export async function loadProfile() { return read().profile; }
export async function saveProfile(uid, data) { const d = read(); d.profile = { ...d.profile, ...data, updatedAt: now() }; write(d); }
export async function listProjects() { const p = read().projects; return Object.entries(p).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
export async function createProject(uid, name, garmentType) { const d = read(), id = newId(); d.projects[id] = { name, garmentType, createdAt: now(), updatedAt: now() }; write(d); return { id }; }
export async function getProject(uid, id) { const v = read().projects[id]; return v ? { id, ...v } : null; }
export async function renameProject(uid, id, name) { const d = read(); if (!d.projects[id]) throw new Error("not found"); d.projects[id] = { ...d.projects[id], name, updatedAt: now() }; write(d); }
export async function removeProject(uid, id) { const d = read(); delete d.projects[id]; write(d); }
export async function saveProjectData(uid, id, data) { const d = read(); if (!d.projects[id]) throw new Error("not found"); d.projects[id] = { ...d.projects[id], ...data, updatedAt: now() }; write(d); }

// Backup and restore
export async function exportAll() { const d = read(); return { app: "FashionCAD Studio", v: 1, savedAt: new Date().toISOString(), profile: d.profile, projects: d.projects }; }
export async function importAll(obj) {
  if (!obj || obj.v !== 1 || typeof obj.projects !== "object" || obj.projects === null) throw new Error("This is not a FashionCAD backup file.");
  const d = read(), clean = {};
  for (const [id, p] of Object.entries(obj.projects)) { if (p && typeof p.name === "string" && /^[\w-]{1,40}$/.test(id)) clean[id] = { ...p, name: p.name.slice(0, 60) }; }
  d.projects = { ...d.projects, ...clean }; if (obj.profile && typeof obj.profile === "object") d.profile = { ...d.profile, ...obj.profile }; write(d); return Object.keys(clean).length;
}
export async function wipeAll() { localStorage.removeItem(KEY); }
