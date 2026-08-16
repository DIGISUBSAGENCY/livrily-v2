// Le dinar tunisien s'affiche avec 3 décimales (millimes).
export function formatTND(amount: number): string {
  return `${amount.toFixed(3)} DT`
}
