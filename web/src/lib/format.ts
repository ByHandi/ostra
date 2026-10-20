import { formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: exp === 0 ? 0 : 1 })} ${UNITS[exp]}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("id-ID");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "belum pernah";
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: localeId });
}
