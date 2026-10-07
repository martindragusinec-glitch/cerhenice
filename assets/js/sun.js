// Poloha slunce pro Cerhenice (zjednodušený výpočet NOAA, přesnost na desetiny stupně).
// azimut: od severu po směru hodin (rad), výška nad obzorem (rad).
export const LAT = 50.062, LON = 15.065;

export const SEASONS = {
  leto: { label: "Léto", note: "21. června", month: 5, day: 21, utc: 2 },
  jaro: { label: "Jaro a podzim", note: "21. března", month: 2, day: 21, utc: 1 },
  zima: { label: "Zima", note: "21. prosince", month: 11, day: 21, utc: 1 },
};

export function sunPosition(date, lat = LAT, lon = LON) {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360) + 360) % 360 * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
  const H = (gmst * 15 + lon) * rad - ra;
  const phi = lat * rad;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
  return { az: (az + 2 * Math.PI) % (2 * Math.PI), el };
}

// Místní čas (hodiny jako desetinné číslo) v daném období → Date v UTC
export function dateFor(season, hours) {
  const s = SEASONS[season];
  const h = Math.floor(hours), m = Math.round((hours - h) * 60);
  return new Date(Date.UTC(2027, s.month, s.day, h - s.utc, m));
}

export function sunAt(season, hours) { return sunPosition(dateFor(season, hours)); }

// východ a západ slunce (místní čas, hodiny)
export function daylight(season) {
  let rise = null, set = null;
  for (let t = 3; t <= 22; t += 1 / 60) {
    const up = sunAt(season, t).el > -0.0145;
    if (up && rise === null) rise = t;
    if (!up && rise !== null && set === null) set = t;
  }
  return { rise, set };
}

export const fmtTime = (t) => `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, "0")}`.replace(/:60$/, ":59");

// směr ke slunci v rovině plánu (x = východ, z = jih)
export const toSun = (az) => [Math.sin(az), -Math.cos(az)];
