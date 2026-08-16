interface DayBucket {
  date: string // 'YYYY-MM-DD'
  avgMinutes: number
  count: number
}

// Mini bar chart fait main (pas de librairie de graphes dans ce projet) :
// temps de livraison moyen par jour sur les 14 derniers jours. Hauteur des
// barres proportionnelle au max de la période, pas à une échelle absolue.
export function ReliabilityHistoryChart({ buckets }: { buckets: DayBucket[] }) {
  if (buckets.every((b) => b.count === 0)) {
    return <p className="text-sm text-slate-500">Aucune livraison sur les 14 derniers jours.</p>
  }

  const maxMinutes = Math.max(1, ...buckets.map((b) => b.avgMinutes))

  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {buckets.map((b) => (
          <div key={b.date} className="group relative flex-1">
            <div
              className="mx-auto w-full rounded-t bg-brand-500/70 transition-colors group-hover:bg-brand-600"
              style={{ height: b.count > 0 ? `${Math.max(6, (b.avgMinutes / maxMinutes) * 100)}%` : '2px' }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
              {new Date(b.date).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit' })} ·{' '}
              {b.count > 0 ? `${b.avgMinutes} min (${b.count})` : 'aucune livraison'}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{new Date(buckets[0].date).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit' })}</span>
        <span>
          {new Date(buckets[buckets.length - 1].date).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit' })}
        </span>
      </div>
    </div>
  )
}
