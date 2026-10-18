/** "Order ID" / "orderId" / "order-id" → "order_id" */
export function toSnakeCase(name: string): string {
  const snake = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (!snake) return "column";
  return /^[0-9]/.test(snake) ? `_${snake}` : snake;
}

/** Ensure names are unique after normalisation: a, a → a, a_2 */
export function dedupeNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    return count === 1 ? n : `${n}_${count}`;
  });
}

const SQL_IDENT = /^[a-z_][a-z0-9_]*$/;

/** Quote an identifier only when needed. */
export function quoteIdent(name: string, quote: '"' | "`" = '"'): string {
  return SQL_IDENT.test(name) ? name : `${quote}${name.replaceAll(quote, quote + quote)}${quote}`;
}
