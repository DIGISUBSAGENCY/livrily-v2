import { createClient } from '@/lib/supabase/server'
import { getCurrentCommerce } from '@/lib/commerce/getCurrentCommerce'
import { NoCommerceLinked } from '@/components/commerce-dashboard/NoCommerceLinked'
import { StaffForm } from '@/components/commerce-dashboard/StaffForm'
import { StaffRow } from '@/components/commerce-dashboard/StaffRow'
import { Card } from '@/components/ui/Card'

export default async function CommerceStaffPage() {
  const commerce = await getCurrentCommerce()
  if (!commerce) return <NoCommerceLinked />

  const supabase = await createClient()
  const { data: staff, error } = await supabase
    .from('commerce_delivery_staff')
    .select('*')
    .eq('commerce_id', commerce.id)
    .order('full_name')

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Équipe de livraison</h1>
      <p className="mt-1 text-sm text-slate-500">
        Registre interne (pas de compte plateforme) : sert juste à indiquer qui a pris une
        commande en livraison.
      </p>

      <Card className="mt-6">
        <StaffForm />
      </Card>

      {error && <p className="mt-6 text-sm text-red-600">Impossible de charger l&apos;équipe.</p>}

      {!error && staff && staff.length === 0 && (
        <p className="mt-8 text-center text-slate-500">Personne enregistré pour l&apos;instant.</p>
      )}

      {!error && staff && staff.length > 0 && (
        <Card className="mt-4">
          {staff.map((member) => (
            <StaffRow key={member.id} staff={member} />
          ))}
        </Card>
      )}
    </main>
  )
}
