import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { verifyFlouciPayment, FlouciApiError, FlouciConfigError } from '@/lib/flouci'

// Mirror de /api/flouci/travel-callback (chantier portefeuille interne,
// brique 2/N) — même garde-fou central : ne JAMAIS faire confiance aux
// paramètres d'URL seuls (falsifiables), revérifier auprès de la vraie API
// Flouci avant tout crédit. Différence structurelle : credit_wallet_deposit_
// flouci()/reject_wallet_deposit_flouci() (schema.sql) ne sont PAS grant à
// `authenticated` (posture plus stricte qu'accept_travel_proposal, cf.
// schema.sql) — cette route doit donc escalader au client admin
// (service_role) pour les appeler, après avoir elle-même confirmé via la
// session RÉELLE de l'utilisateur que ce dépôt lui appartient.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const depositId = searchParams.get('deposit_id')
  const paymentId = searchParams.get('payment_id')
  const result = searchParams.get('result')

  if (!depositId) {
    return NextResponse.redirect(`${origin}/parrainage?flouci=error`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/parrainage`)
  }

  // Lecture via la session RÉELLE de l'utilisateur (RLS
  // wallet_deposits_select_own_or_admin) : confirme tôt que ce dépôt lui
  // appartient (et pas seulement visible parce qu'il est admin) avant
  // d'escalader au client admin plus bas. La RPC revérifie aussi
  // p_profile_id (défense en profondeur), donc cette lecture n'est pas le
  // seul garde-fou.
  const { data: deposit } = await supabase
    .from('wallet_deposits')
    .select('id, profile_id, payment_method')
    .eq('id', depositId)
    .maybeSingle()

  if (!deposit || deposit.profile_id !== user.id || deposit.payment_method !== 'flouci') {
    return NextResponse.redirect(`${origin}/parrainage?flouci=error`)
  }

  const admin = createAdminClient()

  // failLink (échec/abandon du paiement) : rien n'a été payé, rejette
  // directement — jamais de vérification Flouci nécessaire ici.
  if (result === 'failed' || !paymentId) {
    const { error } = await admin.rpc('reject_wallet_deposit_flouci', {
      p_deposit_id: depositId,
      p_profile_id: user.id,
    })
    if (error) {
      console.error('[flouci/wallet-callback] reject_wallet_deposit_flouci (échec) a échoué', {
        message: error.message,
        code: error.code,
      })
    }
    return NextResponse.redirect(`${origin}/parrainage?flouci=failed`)
  }

  try {
    const { success } = await verifyFlouciPayment(paymentId)

    if (!success) {
      await admin.rpc('reject_wallet_deposit_flouci', { p_deposit_id: depositId, p_profile_id: user.id })
      return NextResponse.redirect(`${origin}/parrainage?flouci=failed`)
    }

    const { error } = await admin.rpc('credit_wallet_deposit_flouci', {
      p_deposit_id: depositId,
      p_profile_id: user.id,
      p_payment_ref: paymentId,
    })

    if (error) {
      // Paiement Flouci confirmé (vraie API) mais le crédit a échoué — cas
      // attendu : wallet_deposits_payment_ref_unique rejette une référence
      // déjà utilisée (rafraîchissement de cette page, ou réutilisation
      // d'un paiement réel sur une autre ligne). Le dépôt reste
      // 'awaiting_verification' (jamais silencieusement perdu), incident
      // loggé — pas de double crédit possible.
      console.error('[flouci/wallet-callback] credit_wallet_deposit_flouci a échoué', {
        message: error.message,
        code: error.code,
        depositId,
        paymentId,
      })
      return NextResponse.redirect(`${origin}/parrainage?flouci=error`)
    }

    return NextResponse.redirect(`${origin}/parrainage?flouci=success`)
  } catch (err) {
    const isKnownError = err instanceof FlouciApiError || err instanceof FlouciConfigError
    return NextResponse.redirect(`${origin}/parrainage?flouci=${isKnownError ? 'error' : 'unknown'}`)
  }
}
