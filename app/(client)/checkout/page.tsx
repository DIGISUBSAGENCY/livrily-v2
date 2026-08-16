import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CheckoutForm } from '@/components/checkout/CheckoutForm'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Finaliser la commande',
  description: 'Finalise ta commande sur Livrily.',
  noIndex: true,
})

export default async function CheckoutPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/checkout')
  }

  const [{ data: profile }, { data: bankInfo }] = await Promise.all([
    supabase.from('profiles').select('address, address_lat, address_lng, wallet_balance').eq('id', user.id).single(),
    supabase.from('bank_transfer_info').select('*').eq('is_active', true).limit(1).maybeSingle(),
  ])

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Finaliser la commande</h1>
      <div className="mt-6">
        <CheckoutForm
          defaultAddress={profile?.address ?? null}
          defaultLat={profile?.address_lat ?? null}
          defaultLng={profile?.address_lng ?? null}
          bankInfo={bankInfo ?? null}
          walletBalance={profile?.wallet_balance ?? 0}
        />
      </div>
    </main>
  )
}
