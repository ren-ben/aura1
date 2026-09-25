// Dawn, noon and dusk in Vienna, for the four sun hours of Liber Resh (the
// fourth is midnight). NOAA's approximation: good to a minute or two, which
// is all a bell needs.
const VIENNA = { lat: 48.2082, lon: 16.3738 };
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

// Minutes after midnight UTC on the given day (YYYY-MM-DD).
export function sunTimes(date: string, { lat, lon } = VIENNA): { rise: number; noon: number; set: number } {
  const d = new Date(`${date}T12:00:00Z`);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const n = Math.floor((d.getTime() - start) / 86_400_000) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = deg(Math.acos(Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl)));
  return { rise: 720 - 4 * (lon + ha) - eq, noon: 720 - 4 * lon - eq, set: 720 - 4 * (lon - ha) - eq };
}

// The four hours as minutes after the user's local midnight: dawn, noon,
// dusk, midnight.
export function sunHours(date: string, utcOffset: number): number[] {
  const { rise, noon, set } = sunTimes(date);
  const local = (m: number) => (((Math.round(m + utcOffset)) % 1440) + 1440) % 1440;
  return [local(rise), local(noon), local(set), 0];
}
