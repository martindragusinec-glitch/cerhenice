// Oblíbené pozemky: uložené jen v prohlížeči návštěvníka (localStorage), max 4.
const KEY = "zk-oblibene";
const MAX = 4;
const listeners = new Set();

export function getFavs() {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.slice(0, MAX) : []; }
  catch { return []; }
}
function save(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch { /* soukromé okno: jen v paměti */ }
  memory = arr;
  listeners.forEach((fn) => fn(arr));
}
let memory = getFavs();
export const favs = () => memory;
export const isFav = (id) => memory.includes(id);
export function toggleFav(id) {
  let arr = [...memory];
  let added = false;
  if (arr.includes(id)) arr = arr.filter((x) => x !== id);
  else { arr.push(id); added = true; if (arr.length > MAX) arr = arr.slice(-MAX); }
  arr.sort();
  save(arr);
  (window.dataLayer = window.dataLayer || []).push({ event: "plot_favorite", plot_id: id, added });
  return added;
}
export const onFavs = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const FAV_MAX = MAX;
