/**
 * Cluster region for Garage S3 API.
 */
export const S3_REGION = "garage";

/**
 * Detects the S3 API endpoint based on the current browser URL.
 *
 * Rules:
 * 1. If running on localhost or 127.0.0.1, returns http://s3.localhost
 * 2. If hostname begins with "console.", replaces "console." with "s3."
 *    (e.g., https://console.example.com -> https://s3.example.com)
 * 3. Fallback: ${protocol}//s3.${hostname}${portSuffix}
 */
export function getS3Endpoint(): string {
  if (typeof window === "undefined") {
    return "http://s3.localhost";
  }

  const { protocol, hostname, port } = window.location;
  const portSuffix = port && port !== "80" && port !== "443" ? `:${port}` : "";

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://s3.localhost";
  }

  if (hostname.startsWith("console.")) {
    const base = hostname.slice("console.".length);
    return `${protocol}//s3.${base}${portSuffix}`;
  }

  return `${protocol}//s3.${hostname}${portSuffix}`;
}
