# LIVRILY.TN — COMPLETE PRODUCT AUDIT

> Audit basé sur une relecture complète du code au 21 août 2026 (routes, schéma DB, fonctions RPC, RLS) — pas sur une mémoire de chantiers précédents seule. Chaque affirmation a été vérifiée dans le repo au moment de l'audit. **NON TROUVÉE**/**PARTIELLE** signalent explicitement ce qui n'a pas pu être confirmé dans le code, plutôt que d'être supposé.
>
> Audit en lecture seule : aucun fichier de code n'a été modifié, supprimé ou refactoré pendant sa réalisation.

## 1. Executive Summary

Livrily est **exclusivement une plateforme de crowd-shipping** (2 rôles : client, admin — "voyageur" n'est pas un rôle distinct, c'est n'importe quel compte client qui propose sur une demande). Un volet "livraison de courses/commerces" a existé (checkout, panier, commandes, comptes commerce) puis a été **entièrement supprimé** (branche `chore/remove-commerce-role`, mergée) — aucune trace fonctionnelle ne subsiste, hormis quelques fichiers orphelins jamais nettoyés (détail section 4).

Le cœur du produit — publication de demande, négociation, acceptation, paiement en séquestre (virement ou Flouci), confirmation de réception, libération des fonds, retrait voyageur — est **complet et fonctionnel**, avec des garde-fous DB sérieux (triggers de transition d'état, RLS, fonctions SECURITY DEFINER). Le KYC existe et bloque réellement la publication/l'acceptation. Le système de litiges existe côté utilisateur mais **n'a aucune interface admin pour les résoudre** (section 6/12). Il n'y a **aucun système d'avis/notation** entre utilisateurs.

Deux chantiers frontend récents (`/profil` refondu, `/profil/parametres` refondu) ont ajouté un vrai profil, des stats de confiance, et un panneau "Appareils connectés" dont l'UI a été **volontairement retirée** (placeholder) car l'architecture de login actuelle empêche d'afficher des données fiables — les fonctions RPC restent en place pour un chantier futur.

## 2. Architecture actuelle

- **Stack** : Next.js 14 (App Router), Supabase (Postgres + Auth + Storage), Tailwind. Déployé sur Vercel, un seul environnement Supabase (prod, pas de staging).
- **Routing** : groupes de routes `(auth)` (login/signup client), `(admin-auth)` (login admin séparé), `(client)` (chrome public : accueil, jibli, pages légales), `(admin)` (dashboard admin), `app/profil/*` (hors groupe, chrome public aussi).
- **Auth** : Supabase Auth email/mot de passe + Google OAuth (`components/auth/GoogleSignInButton.tsx`). **Tous les logins passent par des Server Actions** (`app/(auth)/actions.ts`, `app/(admin-auth)/admin/login/actions.ts`) — donc côté serveur, jamais directement depuis le navigateur. Conséquence documentée : `auth.sessions.ip`/`user_agent` ne reflètent jamais le vrai appareil de l'utilisateur (trouvé lors du chantier "Appareils connectés", non corrigé).
- **DB** : 12 tables dans `public` (liste exacte section 13), RLS activée partout, logique métier critique dans des fonctions `SECURITY DEFINER` (pas dans le code applicatif) — modèle délibérément "DB comme source de vérité pour les transitions d'état", pas juste des Server Actions qui font des UPDATE bruts.
- **Storage** : 4 buckets — `payment-proofs` (privé), `travel-request-photos` (public), `profile-photos` (public), `identity-documents` (privé).
- **Notifications** : OneSignal (push web) + Twilio (WhatsApp/SMS) — `lib/onesignal.ts`, `lib/twilio.ts`, `lib/notifications/actions.ts`.
- **Paiement** : Flouci (API tunisienne, `lib/flouci.ts` + webhook `app/api/flouci/travel-callback/route.ts`) et virement bancaire (preuve uploadée, vérifiée manuellement par un admin). **Pas de Stripe/PayPal.**

## 3. Toutes les pages existantes

**Public / marketing** : `/` (accueil), `/comment-ca-marche`, `/cgv`, `/confidentialite`, `/mentions-legales`, `/parrainage`.

**Auth client** : `/login`, `/signup`, `/signup/verification-envoyee`, `/forgot-password`, `/reset-password`.

**Auth admin** (séparée) : `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`.

**Jibli (cœur produit)** : `/jibli` (liste des demandes ouvertes), `/jibli/[id]` (détail + négociation), `/jibli/nouvelle-demande`, `/jibli/mes-demandes`, `/jibli/mes-propositions`, `/jibli/mes-gains`.

**Profil** : `/profil` (vue avec cover/avatar/stats/onglets), `/profil/completer` (édition infos), `/profil/parametres` (identité, vérification, sécurité, notifications, appareils [placeholder], actions sensibles), `/profil/verification-identite`, `/profil/litiges`.

**Admin** : `/admin` (dashboard), `/admin/utilisateurs` (+ `/nouveau`, `/[id]`), `/admin/verifications` (KYC), `/admin/jibli-paiements` (validation escrow), `/admin/retraits`, `/admin/parametres` (+ `/commission`, `/virement` + sous-pages), `/admin/design-system`.

**Pages manquantes notables** (voir section 6) : pas de page admin pour les litiges, pas de page publique "à propos"/"contact", pas de sitemap de pages CGU spécifiques voyageur vs client.

⚠️ **`/admin/design-system` est toujours déployée en prod** — page de dev interne (catalogue de composants UI), déjà signalée dans un audit précédent, jamais retirée ni protégée d'indexation particulière au-delà du blocage `/admin` dans `robots.ts`.

## 4. Features déjà développées ✅

| Feature | Fichiers clés | État |
|---|---|---|
| Signup/login email + Google OAuth | `app/(auth)/actions.ts`, `components/auth/*` | ✅ (mais bug prod signalé plus tôt : signup casse avec "Error sending confirmation email" — problème SMTP externe, jamais confirmé résolu, voir section 6) |
| KYC (upload CIN/passeport + selfie) | `identity_verifications`, `VerificationForm.tsx`, `submit_identity_verification()` RPC | ✅ |
| Blocage KYC réel avant publication/proposition | `lib/identity.ts`, gate dans `nouvelle-demande/actions.ts` et `jibli/[id]/actions.ts` | ✅ |
| Publication de demande | `jibli/nouvelle-demande/*`, table `travel_requests` | ✅ |
| Proposition + négociation (contre-offres) | `travel_proposals`, `travel_proposal_offers`, `submit_counter_offer()`, `agree_to_current_offer()` | ✅ — vraie négociation multi-tours, pas juste accept/reject |
| Acceptation + création escrow | `accept_travel_proposal()` RPC | ✅ |
| Paiement virement (preuve) + Flouci (API réelle) | `AcceptProposalPayment.tsx`, `lib/flouci.ts`, webhook | ✅ |
| Validation admin des virements | `/admin/jibli-paiements` | ✅ |
| Suivi de statut (open→matched→in_transit→completed) | trigger `enforce_travel_request_transitions()` | ✅ |
| Confirmation de réception + libération des fonds | `confirm_travel_receipt()` RPC | ✅ |
| Retrait des gains voyageur | `withdrawal_requests`, `/jibli/mes-gains`, `/admin/retraits`, `travel_voyageur_balance()` | ✅ |
| Commission configurable | `platform_settings.travel_commission_rate`, `/admin/parametres/commission` | ✅ — sur `delivery_fee` uniquement, pas sur `item_price` |
| Litiges (création + suivi côté utilisateur) | `disputes`, `/profil/litiges`, `DisputeForm.tsx` | ✅ création — 🔴 pas de résolution admin (section 6) |
| Parrainage | `referral_code`, `wallet_balance`, `/parrainage` | 🟡 génération/partage OK, **récompense jamais versée** (voir section 6) |
| Profil (cover, avatar, bio, stats confiance) | `/profil`, `components/profile/*` | ✅ |
| Paramètres compte (identité, sécurité, notifications) | `/profil/parametres`, `components/account/*` | ✅ sauf "Appareils connectés" (placeholder assumé) |
| Notifications push + WhatsApp/SMS | OneSignal + Twilio | ✅ |
| Dashboard admin, gestion utilisateurs, KYC, paiements, retraits, commission | `/admin/*` | ✅ |

## 5. Features partielles 🟡

- **Parrainage** : le code de récompense (`grant_referral_reward()`) existe en base mais **son trigger a disparu** avec la suppression de la table `orders` (commerce) — c'était le seul déclencheur. Aucun mécanisme équivalent n'a été rebranché côté Jibli. Un utilisateur peut générer et partager un code, personne ne touche jamais les 5 DT promis.
- **"Appareils connectés"** : RPC `list_my_sessions()`/`revoke_my_session()` écrites, testées, sécurisées — **UI volontairement en placeholder** ("Bientôt disponible") car `auth.sessions` ne contient que l'IP/UA du serveur Vercel, pas du vrai navigateur (tous les logins passent par Server Action).
- **Litiges** : création + liste utilisateur fonctionnelles, **aucune page admin pour les résoudre** — vérifié directement, `grep disputes` dans `app/(admin)` ne retourne rien. La policy RLS `disputes_update_admin_only` existe côté DB mais rien ne l'appelle.
- **KYC admin** : la page `/admin/verifications` ne liste que les statuts `'pending'` — pas d'historique des approuvés/rejetés consultable depuis cette page.

## 6. Features manquantes 🔴

- **Système d'avis/notation entre utilisateurs** : **NON TROUVÉ**. La seule table `ratings` qui existait notait des commerces (supprimée avec le rôle commerce). Aucune table de notation client↔voyageur n'existe. La homepage affiche des badges de confiance ("Litiges pris en charge", "Identité vérifiée") mais aucune vraie note.
- **Résolution admin des litiges** : **NON TROUVÉE** (détaillé ci-dessus).
- **Libération automatique après délai en cas de litige/silence du client** : explicitement **NON implémentée** — commentaire dans `confirm_travel_receipt()` : *"Pas de libération automatique après un délai si le client ne confirme jamais — ce cas de litige est volontairement laissé à une phase admin dédiée"*. Cette "phase admin dédiée" n'existe pas (cf. ci-dessus).
- **Remboursement (`refunded`)** : la valeur d'enum `travel_payment_status.refunded` existe mais **NON TROUVÉE** dans le code applicatif — aucune fonction/action ne l'assigne jamais.
- **2FA** : **NON TROUVÉE** — `SecuritySection.tsx` l'affiche explicitement comme "Non disponible", assumé honnêtement plutôt que fake.
- **Suppression réelle de compte** : **NON TROUVÉE** — seule une désactivation réversible existe (`deactivateAccount()`, `is_active=false`), délibérément (décision produit confirmée, pas un oubli).
- **Signup cassé en prod** : signalé lors d'un audit antérieur (`"Error sending confirmation email"`, 500) — jamais confirmé résolu depuis, cause externe (SMTP), pas re-testé dans cet audit.
- **Fichiers orphelins jamais nettoyés depuis la suppression du commerce** (0 importeur réel vérifié) : `lib/validations/product.ts`, `lib/validations/zone.ts`, `lib/validations/staff.ts`, `components/admin/ReliabilityHistoryChart.tsx`. Sans impact fonctionnel (code mort), juste de la dette.

## 7. Parcours Client

1. **Inscription** — `/signup`, email+mdp ou Google. Compte créé avec rôle `client` par défaut (`handle_new_user()` trigger), code de parrainage généré automatiquement.
2. **Complétion profil** — `/profil/completer` (nom, téléphone, pays, adresse) — requis avant d'accéder au reste (vérifié dans `signIn()`/`auth/callback`).
3. **Vérification d'identité** — `/profil/verification-identite`, upload CIN/passeport + selfie. **Bloquant** pour publier une demande ou accepter une offre (modal `IdentityRequiredModal.tsx` si non fait).
4. **Création d'une demande** — `/jibli/nouvelle-demande` : description, lien produit (URL normalisée, accepte sans `https://`), photo optionnelle, pays d'origine, ville de destination, budget max, date limite optionnelle.
5. **Recherche/matching** — **pas de matching algorithmique** : la demande est publiée publiquement sur `/jibli`, les voyageurs parcourent et proposent eux-mêmes (matching manuel par consultation, pas de suggestion automatique — détaillé section 10).
6. **Réception d'offres** — propositions visibles sur `/jibli/[id]`, badge de tendance 🔥/❄️ (`get_travel_request_engagement()` RPC) basé sur le volume de propositions récentes.
7. **Négociation** — contre-offres multi-tours possibles (`submit_counter_offer`), historique complet (`travel_proposal_offers`), `NegotiationThread.tsx`.
8. **Sélection/acceptation** — un seul voyageur accepté par demande (`accept_travel_proposal()`), les autres propositions passent automatiquement à `rejected`.
9. **Paiement** — virement (preuve uploadée, `awaiting_verification` → validé par admin → `escrowed`) ou Flouci (paiement immédiat via l'API, webhook confirme → `escrowed` direct). **Cash explicitement exclu** de cette étape (aucune garde possible).
10. **Suivi** — statuts `matched` → `in_transit` → `completed`, mis à jour par le voyageur.
11. **Confirmation de livraison** — le CLIENT confirme (`confirm_travel_receipt()`) — c'est ce qui libère les fonds au voyageur, pas le passage à `completed` seul.
12. **Review** — **NON TROUVÉ** (section 6).
13. **Dispute** — `/profil/litiges`, `DisputeForm.tsx`, statut `open`/`resolved`. Résolution : **NON TROUVÉE** côté admin.

## 8. Parcours Voyageur

Rappel : "voyageur" n'est pas un rôle DB, c'est un compte `client` qui propose sur une demande.

1. **Inscription/vérification** — identique au client (même compte, mêmes gates KYC).
2. **Création/ajout d'un voyage** — **NON TROUVÉ en tant qu'entité séparée**. Il n'existe pas de table "voyages" que le voyageur publierait à l'avance ; il propose directement sur une demande existante (`pickup_city`/`travel_date` sont des champs de la *proposition*, pas d'un objet "trajet" indépendant/réutilisable).
3. **Consultation des demandes** — `/jibli`, filtres (`RequestFilters.tsx`) par pays/ville/tri.
4. **Matching** — manuel, par parcours de la liste (pas de push "une demande correspond à ton trajet").
5. **Proposition** — `ProposalForm.tsx` : prix objet, frais de service, ville de départ, date, message. `/jibli/mes-propositions` pour suivre les siennes.
6. **Acceptation** — passive : le client accepte, le voyageur est notifié (push/WhatsApp).
7. **Récupération du colis** — pas de feature dédiée (pas de "preuve de récupération"), seulement le changement de statut `matched → in_transit`.
8. **Transport/livraison** — `in_transit → completed`, changement de statut manuel par le voyageur (`VoyageurStatusActions.tsx`).
9. **Confirmation** — passive côté voyageur (c'est le client qui confirme).
10. **Paiement** — fonds libérés (`released`) à la confirmation client, disponibles pour retrait (`travel_voyageur_balance()` calcule le solde net de commission).
11. **Retrait** — `/jibli/mes-gains`, demande de retrait (`withdrawal_requests`), traité manuellement par un admin sur `/admin/retraits`.
12. **Review** — **NON TROUVÉ**.

## 9. Parcours Admin

- **Dashboard** (`/admin`) — recentré sur Jibli depuis la suppression commerce : demandes ouvertes, paiements en attente (Jibli + retraits), vérifications KYC en attente, 3 tuiles de raccourci.
- **Utilisateurs** (`/admin/utilisateurs`) — liste + recherche/filtre/tri, détail par utilisateur (`[id]`), création manuelle de compte, activation/désactivation, ajustement manuel de solde (`WalletAdjustmentForm.tsx`), historique demandes/propositions/solde/retraits.
- **KYC** (`/admin/verifications`) — approbation/rejet des soumissions pending, preuves via URLs signées (bucket privé).
- **Demandes/Voyages** — **pas de page admin dédiée de supervision globale des demandes** (pas de `/admin/demandes`) ; visibles uniquement via le détail d'un utilisateur.
- **Transactions/Paiements** — `/admin/jibli-paiements` (validation escrow virement), `/admin/retraits` (traitement des retraits voyageur).
- **Disputes** — **NON TROUVÉ** côté admin (répété, c'est le trou le plus significatif de l'audit).
- **Commissions** — `/admin/parametres/commission`, taux modifiable, appliqué en temps réel par `accept_travel_proposal()`.
- **Modération** — activation/désactivation de compte uniquement ; pas de modération de contenu (photos, descriptions) au-delà de ça.
- **Statistiques** — limitées aux tuiles du dashboard ; pas de page analytics dédiée.
- **Notifications** — pas d'interface admin pour envoyer des notifications manuelles/broadcast ; les notifications sont uniquement transactionnelles (déclenchées par des événements système).

## 10. Matching System

**Confirmé : il n'existe aucun matching algorithmique.** Pas de scoring, pas de suggestion automatique, pas de notification "une demande correspond à ton trajet habituel". Le "matching" est entièrement manuel : le client publie, tout voyageur peut consulter `/jibli` et proposer sur n'importe quelle demande ouverte, filtrable par pays/ville/tri (`RequestFilters.tsx`). Le seul signal algorithmique existant est l'indicateur de tendance 🔥/❄️ (`getTravelTrend()`, basé sur le nombre de propositions récentes vs total), qui est un indicateur de popularité, pas un matching.

## 11. Payment & Transaction Flow

**Séquence complète** (vérifiée dans `accept_travel_proposal()` et `confirm_travel_receipt()`, `supabase/schema.sql`) :

1. Client accepte une proposition → choix virement ou Flouci (**cash explicitement rejeté** : `if p_payment_method not in ('virement', 'flouci') then raise exception`).
2. **Virement** : preuve obligatoire à l'upload (`payment_proof_url`), statut `awaiting_verification` → admin valide manuellement sur `/admin/jibli-paiements` → `escrowed`.
3. **Flouci** : paiement immédiat via l'API réelle (`lib/flouci.ts`), callback (`app/api/flouci/travel-callback/route.ts`) **revérifie le statut auprès de Flouci** (jamais confiance aux paramètres d'URL) avant d'appeler `accept_travel_proposal` → `escrowed` direct, pas de validation admin nécessaire.
4. **Séquestre** : l'argent est "bloqué" dès `escrowed` — ligne dans `travel_payments`, montant = `item_price + delivery_fee`, commission = `delivery_fee × platform_settings.travel_commission_rate` (config admin, **appliquée uniquement sur les frais de service, jamais sur le prix de l'objet**).
5. **Libération** : uniquement via `confirm_travel_receipt()`, appelée par le CLIENT — passe `travel_payments.status` à `released`, pose `travel_requests.client_confirmed_at`. Le voyageur seul passant sa demande à `completed` ne libère rien.
6. **Retrait** : `travel_voyageur_balance()` calcule le solde net (somme des `released` moins commission, moins retraits déjà `pending`/`paid`) — le voyageur demande un retrait (`withdrawal_requests`), traité manuellement sur `/admin/retraits`.
7. **Annulation** : possible uniquement tant que `travel_requests.status = 'open'` (avant acceptation) — `CancelRequestButton.tsx`. **Aucune annulation possible après acceptation/paiement** — pas de flow "annuler une transaction en cours".
8. **Remboursement** : valeur d'enum `refunded` existe, **jamais assignée par aucun code** — NON TROUVÉ en pratique. Le commentaire du webhook Flouci confirme : un paiement "orphelin" (Flouci payé mais `accept_travel_proposal` échoue) nécessite une intervention manuelle admin, sans outil dédié pour ça.
9. **Paiement orphelin Flouci** : cas réel non outillé — juste un log et une redirection `?flouci=orphaned`, pas de page admin pour retrouver/traiter ces cas.

## 12. KYC & Trust

- **KYC** : upload CIN/passeport + selfie (`identity_verifications`, statuts `pending`/`approved`/`rejected`), une ligne par profil (resoumission écrase la précédente, pas d'historique des tentatives). Admin approuve/rejette sur `/admin/verifications` (uniquement les `pending` visibles, pas d'historique consultable). Gate réel côté serveur (`lib/identity.ts`) sur publication de demande et sur proposition — pas juste un blocage visuel.
- **Trust côté profil** : `/profil/parametres` calcule un "niveau de confiance" 0/50/100% sur 2 critères réels (email confirmé + KYC approuvé) — `lib/trustLevel.ts`, pas de valeur hardcodée.
- **Badges de confiance publics** (homepage) : "Paiement sécurisé", "Identité vérifiée", "Litiges pris en charge" — 2 des 3 correspondent à du réel (paiement séquestré, KYC), le 3e ("litiges pris en charge") est **optimiste** vu l'absence de résolution admin.
- **Avis/notation** : NON TROUVÉ (répété, c'est un vrai trou pour la confiance peer-to-peer).

## 13. Database

**12 tables `public`** (vérifié par grep direct dans `schema.sql`) :

| Table | Rôle | Relations clés |
|---|---|---|
| `profiles` | 1 ligne / utilisateur Auth, tous rôles | `auth.users.id` (PK partagée) |
| `travel_requests` | Demandes crowd-shipping | `client_id → profiles`, `accepted_proposal_id → travel_proposals` |
| `travel_proposals` | Propositions voyageur | `request_id → travel_requests`, `voyageur_id → profiles` |
| `travel_proposal_offers` | Historique des tours de négociation | `proposal_id → travel_proposals` |
| `travel_payments` | Escrow (1 par demande) | `request_id → travel_requests` (unique) |
| `withdrawal_requests` | Demandes de retrait voyageur | `voyageur_id → profiles` |
| `wallet_credits` | Journal parrainage (append-only) | `profile_id → profiles`, `order_id` (uuid nu, orphelin depuis suppression commerce) |
| `wallet_adjustments` | Ajustements manuels admin | `profile_id → profiles`, `created_by → profiles` |
| `platform_settings` | Singleton config (commission) | — |
| `bank_transfer_info` | Coordonnées virement/Flouci plateforme | — |
| `identity_verifications` | KYC | `profile_id → profiles` (unique) |
| `disputes` | Litiges | `travel_request_id`, `opened_by → profiles` |

**Problèmes détectés** :
- `wallet_credits.order_id` : colonne orpheline (référençait `orders`, supprimée) — `uuid` nu sans contrainte, dette technique mineure mais réelle.
- `wallet_credits.reason` inclut toujours `'checkout_redemption'` dans son `check` constraint — valeur plus jamais assignable, jamais nettoyée.
- **Pas de duplication de données détectée** — le schéma est plutôt discipliné (compteurs incrémentaux documentés comme tels, pas de recalcul redondant).
- **Scalabilité** : `travel_proposal_offers` grandit indéfiniment sans purge (acceptable à ce stade) ; pas d'index composite visible sur `travel_requests(status, destination_city)` pour les filtres de recherche — à surveiller si le volume grossit, non bloquant maintenant.
- **Champ manquant notable** : aucune table de notation/review, aucune colonne de géolocalisation structurée pour le matching (juste `origin_country`/`destination_city` en texte libre, pas de normalisation géo).

## 14. Security Audit

- **Authentification/autorisation** : RLS activée sur toutes les tables `public` vérifiées. Fonctions sensibles en `SECURITY DEFINER` avec vérifications explicites de propriété (`auth.uid()` comparé, jamais fait confiance à un paramètre client) — pattern cohérent et solide, y compris le piège NULL déjà corrigé une fois (`is distinct from` dans `revoke_my_session`).
- **Protection admin** : `lib/supabase/middleware.ts` vérifie `role='admin'` ET `is_active=true` à CHAQUE requête sur `/admin/*` (sauf les 3 pages d'auth publiques listées explicitement) — pas juste un contrôle à la connexion.
- **Secrets** : aucun secret hardcodé trouvé (grep ciblé clés AWS/Stripe/clés privées : rien). `SUPABASE_SERVICE_ROLE_KEY` confiné à un seul fichier (`lib/supabase/server.ts`), jamais exposé au bundle client (pas de préfixe `NEXT_PUBLIC_`).
- **Webhook/callback paiement** : le callback Flouci **ne fait jamais confiance aux paramètres d'URL** — revérifie systématiquement le statut réel auprès de l'API Flouci avant toute action. Bonne pratique confirmée.
- **Upload fichiers** : tous les buckets ont une limite de taille (5 Mo) et une whitelist MIME (`image/jpeg`, `image/png`, `image/webp`) — pas de validation de contenu réel au-delà du MIME déclaré (un fichier renommé pourrait théoriquement passer, risque mineur classique, pas spécifique à Livrily).
- **Manipulation de prix** : `item_price`/`delivery_fee` toujours validés côté serveur (Zod, `.min(0)`) avant écriture — mais **aucune borne maximale** n'a été trouvée sur ces champs (un client pourrait proposer un montant absurde, pas un risque de sécurité mais un risque de qualité/abus).
- **Fraude/abus** : cooldown 60s sur les endpoints d'envoi d'email (reset password, resend confirmation) — protège contre le spam basique. **Pas de rate-limiting général** trouvé sur les Server Actions (ex: rien n'empêche un spam de propositions).
- **Accès admin** : compte admin créé manuellement en base (`update profiles set role='admin'`), pas de self-service — correct pour un premier admin, mais **aucune trace d'audit log** des actions admin (qui a validé quel paiement, qui a rejeté quel KYC) au-delà des colonnes `reviewed_by`/`verified_by` ponctuelles sur certaines tables.
- **Point structurel déjà documenté** : tous les logins passent par Server Action, donc toute fonctionnalité future basée sur l'IP/l'appareil réel de l'utilisateur (alertes "nouvelle connexion suspecte", géo-fraude) ne peut pas s'appuyer sur `auth.sessions` telle quelle.

## 15. UX/UI Audit

- **Onboarding** : `OnboardingTour.tsx` (tour guidé 4 étapes, affiché une fois) — présent et fonctionnel.
- **Confiance utilisateur** : badges homepage + panneau confiance sur `/profil/parametres` — cohérents visuellement (palette `brand` verte partagée), mais le badge "Litiges pris en charge" survend une fonctionnalité incomplète.
- **Checkout/paiement** : flow clair (choix virement/Flouci sur la page de détail de la demande), mais **aucun retour utilisateur pour le cas "paiement Flouci orphelin"** au-delà d'un message générique dans l'URL — expérience dégradée silencieuse pour un cas d'échec réel et déjà anticipé dans le code.
- **Dashboard client** : pas de dashboard unifié à proprement parler — `/jibli/mes-demandes`, `/jibli/mes-propositions`, `/jibli/mes-gains` et `/profil` sont séparés plutôt que centralisés en un seul écran.
- **Dashboard voyageur** : même remarque — pas d'écran "aujourd'hui, voici tes livraisons en cours" unifié.
- **Dashboard admin** : recentré et cohérent depuis la suppression commerce, mais **pas de vue globale des demandes/litiges** (juste des tuiles de raccourci ciblées).
- **Mobile responsiveness** : classes Tailwind responsive (`sm:`/`lg:`) utilisées systématiquement dans les composants parcourus, `MobileNav.tsx` dédié — pas d'audit visuel réel possible sans navigateur (limite de cet outil), mais rien dans le code ne suggère une page non responsive.
- **Navigation** : cohérente (Header/Footer partagés, `UserMenu.tsx` centralisé) mais un lien mort a été trouvé et jamais corrigé : `UserMenu.tsx` "Mon activité" pointait vers `/commandes` (supprimée avec le commerce) — **à revérifier**, possible qu'il ait été corrigé depuis, non retesté dans cet audit précis.
- **Incohérence terminologique mineure** : la page marketing appelle parfois le produit "Jibli chay men l'a5er", ailleurs juste "Jibli" ou "crowd-shipping" — pas un problème fonctionnel, juste un manque d'uniformité de ton.

## 16. Business Model actuel

**Ce qui existe déjà (vérifié dans le code)** :
- **Commission sur frais de service** : seule source de revenu implémentée — `delivery_fee × travel_commission_rate` (configurable, appliquée automatiquement à chaque acceptation).

**C'est tout.** Aucune autre source de monétisation n'a été trouvée dans le code — pas de frais d'inscription, pas d'abonnement, pas de frais de protection séparé, pas de compte business.

## 17. Opportunités business (suggestions — clairement séparées de l'existant)

- **Commission sur `item_price` aussi** (actuellement 0% dessus) — évaluer l'impact sur l'attractivité prix vs revenu.
- **Frais de protection/assurance optionnel** côté client (produits chers) — nécessiterait un vrai système de remboursement, absent aujourd'hui.
- **Compte "voyageur pro"** (multi-trajets réguliers) — nécessiterait d'abord l'entité "voyage" indépendante, qui n'existe pas.
- **Boost de visibilité payant** pour une demande urgente.
- **Frais de retrait** (actuellement gratuits, `withdrawal_requests` n'a pas de colonne de frais).

## 18. Ce qui différencie LIVRILY

En l'état du code : **séquestre réel avec double rail de paiement local (virement tunisien + Flouci)**, KYC obligatoire à double sens (client ET voyageur), négociation multi-tours (pas juste accepter/refuser), et un modèle 100% recentré crowd-shipping (pas de dilution avec un volet commerce, contrairement à l'ambition initiale du projet). Le point faible différenciant : **aucune notation entre particuliers** — pour une marketplace de confiance peer-to-peer, c'est habituellement un pilier central (Airbnb, BlaBlaCar…), absent ici.

## 19. Roadmap P0 / P1 / P2 / P3

### P0 — Bloquant pour lancer

| Feature | Raison | Impact | Difficulté | Dépendances |
|---|---|---|---|---|
| Résolution admin des litiges | Sans ça, un litige réel n'a nulle part où aller — RLS existe déjà, juste pas d'UI | Confiance + risque légal/réputation | Moyenne | `disputes` table (déjà là) |
| Vérifier/corriger le signup cassé en prod | Bloque l'acquisition de nouveaux utilisateurs si toujours cassé | Critique, pas re-testé dans cet audit | Faible-Moyenne (dépend de la cause SMTP) | Config externe (SMTP) |
| Gestion des paiements Flouci orphelins | Argent réellement pris au client sans transaction enregistrée, aucun outil pour le retrouver | Financier + confiance | Moyenne | `travel_payments`, admin UI |

### P1 — Très important

| Feature | Raison | Impact | Difficulté | Dépendances |
|---|---|---|---|---|
| Système d'avis/notation | Pilier de confiance standard pour ce type de marketplace, absent | Confiance, conversion | Moyenne (nouvelle table + RLS + UI) | `travel_requests` complétées |
| Rebrancher le parrainage (récompense sur completion Jibli) | Fonctionnalité à moitié construite, trompe l'utilisateur qui partage sans jamais être payé | Acquisition + confiance | Faible-Moyenne (adapter `grant_referral_reward`) | `travel_requests.status='completed'` |
| Corriger le lien mort UserMenu ("Mon activité") si toujours présent | Petit mais visible à chaque session | UX | Très faible | — |

### P2 — Important après le lancement

| Feature | Raison | Impact | Difficulté | Dépendances |
|---|---|---|---|---|
| Libération automatique après délai (litige/silence client) | Actuellement le voyageur peut rester bloqué indéfiniment si le client ne confirme jamais | Confiance voyageur | Moyenne (cron/job + logique métier) | Résolution litiges (P0) |
| Dashboard admin des demandes (vue globale) | Actuellement navigable seulement via un utilisateur | Efficacité opérationnelle | Faible-Moyenne | — |
| Nettoyage dette technique (fichiers orphelins, colonnes mortes) | Pas d'impact utilisateur direct, hygiène | Maintenabilité | Faible | — |

### P3 — Nice to have

| Feature | Raison | Impact | Difficulté | Dépendances |
|---|---|---|---|---|
| 2FA | Sécurité renforcée, pas critique au volume actuel | Sécurité | Moyenne-Élevée | Architecture login (déjà notée à repenser) |
| Appareils connectés (réel) | Chantier déjà exploré, bloqué sur l'architecture login | Sécurité perçue | Élevée (déplacer le login côté client) | Refonte login |
| Matching algorithmique / suggestions | Actuellement 100% manuel | Croissance/rétention | Élevée | Volume de données suffisant d'abord |
| Frais/monétisation additionnels | Croissance revenu | Business | Variable | Traction produit d'abord |

## 20. TOP 10 des choses à faire ensuite

1. **Revérifier si le signup est toujours cassé en prod** — c'est la porte d'entrée, si c'est encore cassé rien d'autre ne compte.
2. **Construire la résolution admin des litiges** — le trou le plus concret trouvé dans cet audit.
3. **Décider du sort du paiement Flouci orphelin** — au minimum une page admin pour les lister/traiter manuellement.
4. **Décider : rebrancher le parrainage ou retirer la promesse "5 DT"** — actuellement trompeur tel quel.
5. **Décider si un système d'avis est fait maintenant ou explicitement reporté** — impacte le discours produit dès aujourd'hui ("Litiges pris en charge" sans avis, c'est bancal).
6. **Nettoyer les 3-4 fichiers orphelins de la suppression commerce** — 30 minutes, zéro risque, dette qui traîne.
7. **Revérifier le lien "Mon activité" du UserMenu** — confirmer qu'il ne pointe plus vers une route morte.
8. **Ajouter une borne max sur `item_price`/`delivery_fee`** — protection basique contre l'abus, pas fait actuellement.
9. **Historique KYC côté admin** (pas juste les pending) — utile dès qu'il y a un litige sur une décision passée.
10. **Clarifier la doctrine business avant tout redesign** — commission actuelle = seule source de revenu ; décider maintenant, pas après avoir construit d'autres features dessus.

---

## Tableau récapitulatif

| Feature | Status | Où dans le code | Importance | Action |
|---|---|---|---|---|
| Signup/login email + Google | ✅ (bug prod signalé, non revérifié) | `app/(auth)/actions.ts` | Critique | Revérifier signup |
| KYC upload + gate réel | ✅ | `identity_verifications`, `lib/identity.ts` | Critique | RAS |
| Publication demande | ✅ | `travel_requests`, `jibli/nouvelle-demande` | Critique | RAS |
| Négociation multi-tours | ✅ | `travel_proposal_offers`, `submit_counter_offer()` | Élevée | RAS |
| Acceptation + escrow | ✅ | `accept_travel_proposal()` | Critique | RAS |
| Paiement virement | ✅ | `AcceptProposalPayment.tsx`, `/admin/jibli-paiements` | Critique | RAS |
| Paiement Flouci | ✅ | `lib/flouci.ts`, webhook | Critique | Gérer les orphelins (P0) |
| Confirmation réception + libération | ✅ | `confirm_travel_receipt()` | Critique | RAS |
| Retrait voyageur | ✅ | `withdrawal_requests`, `/admin/retraits` | Élevée | RAS |
| Commission configurable | ✅ | `platform_settings`, `/admin/parametres/commission` | Élevée | RAS |
| Litiges — création | ✅ | `disputes`, `/profil/litiges` | Élevée | — |
| Litiges — résolution admin | 🔴 | NON TROUVÉ | Critique | **Construire (P0)** |
| Avis/notation | 🔴 | NON TROUVÉ | Élevée | Construire (P1) |
| Parrainage | 🟡 | `grant_referral_reward()` orpheline | Moyenne | Rebrancher ou retirer (P1) |
| Appareils connectés | 🟡 (placeholder assumé) | `list_my_sessions()` (RPC prête, UI désactivée) | Faible | Refonte login d'abord (P3) |
| 2FA | 🔴 | NON TROUVÉ, affiché honnêtement | Faible | P3 |
| Remboursement | 🔴 | Enum existe, jamais assignée | Moyenne | Lié à résolution litiges |
| Libération auto après délai | 🔴 | NON implémentée (documenté comme tel) | Moyenne | P2 |
| Dashboard admin demandes | 🔴 | NON TROUVÉ | Moyenne | P2 |
| Matching algorithmique | 🔴 | NON TROUVÉ (100% manuel) | Faible (pour l'instant) | P3 |
| Suppression compte réelle | 🔴 | NON TROUVÉ (désactivation seulement, voulu) | Faible | — |
| Fichiers orphelins commerce | ⚠️ | `lib/validations/{product,zone,staff}.ts`, `ReliabilityHistoryChart.tsx` | Faible | Nettoyer (P2) |
| `/admin/design-system` en prod | ⚠️ | `app/(admin)/admin/design-system/` | Faible | Retirer ou protéger |
