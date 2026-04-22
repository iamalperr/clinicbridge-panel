/**
 * Formats a number with comma separators (e.g., 1000 -> 1,000)
 */
export function formatNumber(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
