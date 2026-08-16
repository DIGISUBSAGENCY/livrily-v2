import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyFlouciPayment, FlouciApiError, FlouciConfigError } from '@/lib/flouci'

// Flouci redirige ici après la tentative de paiement (success_link). On ne
// fait JAMAIS confiance aux paramètres d'URL seuls (falsifiables) : on
// revérifie le statut réel auprès de l'API Flouci avant d'accepter quoi que
// ce soit. C'est seulement après cette vérification que
// accept_travel_proposal est appelée (donc que la proposition est
// réellement acceptée et le paiement escrowed).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const proposalId = searchParams.get('proposal_id')
  const requestId = searchParams.get('request_id')
  const paymentId = searchParams.get('payment_id')

  if (!proposalId || !requestId || !paymentId) {
    return NextResponse.redirect(`${origin}/jibli?flouci=error`)
  }

  const redirectTarget = `${origin}/jibli/${requestId}`

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/jibli/${requestId}`)
  }

  try {
    const { success } = await verifyFlouciPayment(paymentId)

    if (!success) {
      return NextResponse.redirect(`${redirectTarget}?flouci=failed`)
    }

    const { error } = await supabase.rpc('accept_travel_proposal', {
      p_proposal_id: proposalId,
      p_payment_method: 'flouci',
      p_payment_ref: paymentId,
    })

    if (error) {
      // Paiement Flouci confirmé mais l'acceptation a échoué (ex: demande
      // annulée entre-temps) : le paiement reste orphelin côté Flouci, sans
      // enregistrement travel_payments — nécessite un remboursement manuel
      // par l'admin. Pas de logique de remboursement automatique pour l'instant.
      return NextResponse.redirect(`${redirectTarget}?flouci=orphaned`)
    }

    return NextResponse.redirect(`${redirectTarget}?flouci=success`)
  } catch (err) {
    const message = err instanceof FlouciApiError || err instanceof FlouciConfigError
    return NextResponse.redirect(`${redirectTarget}?flouci=${message ? 'error' : 'unknown'}`)
  }
}
