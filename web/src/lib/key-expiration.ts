export type ExpirationStatus = "active" | "expiring_soon" | "expired" | "never";

export interface KeyExpirationInfo {
  status: ExpirationStatus;
  label: string;
  badgeVariant?: "destructive" | "warning" | "success" | "secondary" | "outline";
}

export type PresetExpiration = "never" | "7d" | "30d" | "90d" | "custom";

export const PRESET_EXPIRATION_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "custom", label: "Custom date" },
];

export function getKeyExpirationStatus(key: {
  expired: boolean;
  expiresAt: string | null;
}): KeyExpirationInfo {
  if (key.expired) {
    return { status: "expired", label: "Expired", badgeVariant: "destructive" };
  }
  if (!key.expiresAt) {
    return { status: "never", label: "Never expires" };
  }
  const expiryTime = new Date(key.expiresAt).getTime();
  const now = Date.now();
  if (expiryTime <= now) {
    return { status: "expired", label: "Expired", badgeVariant: "destructive" };
  }
  const diffHours = (expiryTime - now) / (1000 * 60 * 60);
  if (diffHours <= 72) {
    return { status: "expiring_soon", label: "Expiring soon", badgeVariant: "warning" };
  }
  return { status: "active", label: "Active", badgeVariant: "success" };
}

export function calculateExpiresAt(
  preset: PresetExpiration,
  customDate?: Date,
): { expiresAt: string | null; error?: string } {
  const now = Date.now();
  if (preset === "7d") {
    return { expiresAt: new Date(now + 7 * 86400000).toISOString() };
  }
  if (preset === "30d") {
    return { expiresAt: new Date(now + 30 * 86400000).toISOString() };
  }
  if (preset === "90d") {
    return { expiresAt: new Date(now + 90 * 86400000).toISOString() };
  }
  if (preset === "custom") {
    if (!customDate) {
      return { expiresAt: null, error: "Please choose an expiration date" };
    }
    if (customDate.getTime() <= now) {
      return { expiresAt: null, error: "Expiration date must be in the future" };
    }
    return { expiresAt: customDate.toISOString() };
  }
  return { expiresAt: null };
}
