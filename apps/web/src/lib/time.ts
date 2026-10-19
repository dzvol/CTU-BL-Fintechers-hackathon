import { useEffect, useState } from 'react';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "5 min ago", "in 21 hr"; under a minute is "now". */
export function fromNow(iso: string, now = Date.now()) {
  const diff = Date.parse(iso) - now;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) return relative.format(Math.trunc(diff / ms), unit);
  }
  return 'now';
}

/** Full local date and time, for titles and detail pages. */
export const fullTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/** "4:05" until the deadline, or undefined once it passed. */
export function countdown(iso: string, now = Date.now()) {
  const left = Date.parse(iso) - now;
  if (left <= 0) return undefined;
  const seconds = Math.ceil(left / 1000);
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Current time that re-renders the caller every `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return now;
}
