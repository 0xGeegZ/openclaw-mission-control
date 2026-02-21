/**
 * Health status helper utilities.
 *
 * Note: Core status functions are imported from dedicated modules:
 * - getDeliveryState from ./delivery
 * - getGatewayState from ./gateway
 * - getHeartbeatState from ./heartbeat
 * - getAgentSyncState from ./agent-sync
 *
 * This module provides status aggregation and formatting helpers.
 */

/**
 * Check whether a remote address is loopback or private network.
 * Exported for unit tests.
 */
export function isLocalAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true;

  const ipv4Candidate = normalized.startsWith("::ffff:")
    ? normalized.slice("::ffff:".length)
    : normalized;
  const octets = parseIpv4Octets(ipv4Candidate);
  if (!octets) return false;
  return isLoopbackIpv4(octets) || isPrivateIpv4(octets);
}

/**
 * Parse a dotted IPv4 string into octets.
 */
function parseIpv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number.parseInt(part, 10));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets;
}

/**
 * Check for IPv4 loopback range.
 */
function isLoopbackIpv4(octets: number[]): boolean {
  return octets[0] === 127;
}

/**
 * Check for RFC1918 private IPv4 ranges (used by Docker networks).
 */
function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}
