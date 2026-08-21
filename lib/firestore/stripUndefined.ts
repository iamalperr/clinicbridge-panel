/**
 * Firestore rejects `undefined` field values. Strip them recursively before writes.
 * Arrays are kept as-is (elements are not deep-stripped unless objects).
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === undefined) {
    return value;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value instanceof Date) {
    return value;
  }
  // Firestore Timestamp / FieldValue-like objects: leave untouched
  if (typeof (value as any).toDate === "function" || typeof (value as any)._methodName === "string") {
    return value;
  }
  const out: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value as Record<string, any>)) {
    if (nested === undefined) continue;
    out[key] = stripUndefinedDeep(nested);
  }
  return out as T;
}
