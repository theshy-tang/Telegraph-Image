/**
 * External request telemetry is disabled until an explicitly configured,
 * reviewed integration can guarantee credential and media privacy.
 * Keep the middleware exports compatible with existing Pages handlers.
 */
export async function errorHandling(context) {
  context.data.telemetry = false;
  return context.next();
}

export function telemetryData(context) {
  return context.next();
}

export async function traceData() {
  // No external request, credential, file ID or upload metadata collection.
}
