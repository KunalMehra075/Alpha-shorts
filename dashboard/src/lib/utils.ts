import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// URL for a project media file (served by the API at /media/<id>/<file>).
export function mediaUrl(id: string, file: string) {
  return `/media/${id}/${file}`;
}

// URL for a global media-library file (served by the API at /library/<file>).
export function libraryUrl(file: string) {
  return `/library/${file}`;
}

// URL for a global Elements-library file (served by the API at /element-lib/<file>).
export function elementUrl(file: string) {
  return `/element-lib/${file}`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

// Compact number for analytics: 1234 -> 1.2K, 1250000 -> 1.3M.
export function formatCompact(n: number): string {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  const units = [
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' }
  ];
  for (const u of units) {
    if (abs >= u.v) {
      const val = n / u.v;
      return `${val.toFixed(val >= 10 ? 0 : 1)}${u.s}`;
    }
  }
  return String(Math.round(n));
}

// Minutes -> "1h 23m" / "45m" / "12s" (watch time is stored in minutes).
export function formatWatchTime(minutes: number): string {
  if (!minutes) return '0m';
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// Seconds -> "m:ss" (average view duration is stored in seconds).
export function formatDurationSec(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}
