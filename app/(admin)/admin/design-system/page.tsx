import type { Metadata } from 'next'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export const metadata: Metadata = { title: 'Design system — Ledger', robots: { index: false, follow: false } }

// Page de travail interne, pas liée dans AdminNav : sert à visualiser les
// composants de la direction "Ledger" (variant="ledger") au fur et à
// mesure qu'ils sont construits, sans toucher une seule vraie page tant
// que la direction n'est pas validée à l'usage. Gated par le layout
// (admin)/admin déjà en place (middleware). À retirer ou requalifier une
// fois la migration des pages terminée.
export default function DesignSystemPreviewPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Design system — Ledger</h1>
      <p className="mt-1 text-sm text-slate-500">
        Aperçu de travail des composants de base de la direction Ledger, au fur et à mesure de leur
        construction. Non lié dans la navigation.
      </p>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Card</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Card variant="ledger">
            <p className="font-semibold text-ledger-text">Card — repos</p>
            <p className="mt-1 text-sm text-ledger-muted">variant=&quot;ledger&quot;, sans interactive</p>
          </Card>
          <Card variant="ledger" interactive>
            <p className="font-semibold text-ledger-text">Card — interactive</p>
            <p className="mt-1 text-sm text-ledger-muted">survole pour voir l&apos;état hover</p>
          </Card>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Button</h2>
        <Card variant="ledger" className="mt-3 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ledger-primary">Valider</Button>
            <Button variant="ledger-secondary">Annuler</Button>
            <Button variant="ledger-primary" disabled>
              Valider
            </Button>
            <Button variant="ledger-secondary" disabled>
              Annuler
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ledger-primary" size="sm">
              Petit
            </Button>
            <Button variant="ledger-primary" size="md">
              Moyen
            </Button>
            <Button variant="ledger-primary" size="lg">
              Grand
            </Button>
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Badge</h2>
        <Card variant="ledger" className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="ledger" tone="neutral">
            En attente
          </Badge>
          <Badge variant="ledger" tone="success">
            Livrée
          </Badge>
          <Badge variant="ledger" tone="warning">
            À vérifier
          </Badge>
          <Badge variant="ledger" tone="danger">
            Rejetée
          </Badge>
          <Badge variant="ledger" tone="info">
            En cours
          </Badge>
        </Card>
      </section>
    </main>
  )
}
