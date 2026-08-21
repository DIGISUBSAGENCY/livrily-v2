import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
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
      // Paiement Flouci confirmé (vérifié ci-dessus auprès de la vraie API,
      // jamais sur la foi des query params) mais l'acceptation a échoué (ex:
      // demande qui n'est plus 'open', proposition qui n'est plus 'pending'
      // — race avec un autre voyageur accepté entre-temps, ou demande
      // annulée pendant le checkout Flouci) : le paiement reste orphelin
      // côté Flouci, sans enregistrement travel_payments. On capture
      // l'incident pour qu'un admin puisse le traiter depuis
      // /admin/flouci-incidents — jusqu'ici rien n'était enregistré, juste
      // ce paramètre d'URL perdu au refresh.
      // Client admin car aucune policy INSERT n'existe pour authenticated
      // sur flouci_payment_incidents (écriture réservée au système).
      const { data: proposal } = await supabase
        .from('travel_proposals')
        .select('item_price, delivery_fee')
        .eq('id', proposalId)
        .maybeSingle()

      if (proposal) {
        const admin = createAdminClient()
        const { error: insertError } = await admin.from('flouci_payment_incidents').insert({
          travel_request_id: requestId,
          travel_proposal_id: proposalId,
          client_id: user.id,
          flouci_payment_id: paymentId,
          amount: proposal.item_price + proposal.delivery_fee,
          error_message: error.message,
        })
        // flouci_payment_id est unique : un doublon (ex. l'utilisateur
        // rafraîchit la page de callback) déclenche une violation de
        // contrainte ici, ce qui est le comportement voulu — on ne veut
        // qu'une seule ligne d'incident par paiement Flouci.
        if (insertError && insertError.code !== '23505') {
          console.error('[flouci/travel-callback] échec insertion incident', {
            message: insertError.message,
            code: insertError.code,
          })
        }
      } else {
        console.error('[flouci/travel-callback] proposition introuvable pour capturer l\'incident', {
          proposalId,
        })
      }

      return NextResponse.redirect(`${redirectTarget}?flouci=orphaned`)
    }

    return NextResponse.redirect(`${redirectTarget}?flouci=success`)
  } catch (err) {
    const message = err instanceof FlouciApiError || err instanceof FlouciConfigError
    return NextResponse.redirect(`${redirectTarget}?flouci=${message ? 'error' : 'unknown'}`)
  }
}
