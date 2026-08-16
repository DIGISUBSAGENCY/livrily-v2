# Livrily 2.0

Plateforme de livraison à la demande pour le marché tunisien (courses,
supermarché, boulangerie, fruits & légumes) — Next.js 14 (App Router) +
Supabase (Postgres/PostGIS) + Tailwind CSS.

Il n'y a pas de rôle "livreur" indépendant : c'est le commerce partenaire
lui-même (gérant, employé, ou livreur qu'il emploie en interne, sans compte
plateforme) qui prend en charge la livraison de ses commandes.

## Stack

- **Next.js 14** (App Router, Server Actions), TypeScript strict
- **Supabase** : Postgres + PostGIS, Auth, Storage, Realtime
- **Tailwind CSS**, composants faits main (pas de librairie UI)
- **Google Maps JavaScript API** (autocomplete d'adresse, tracking)

## Démarrage local

```bash
npm install
cp .env.local.example .env.local   # puis renseigner les vraies valeurs
npm run dev
```

## Configuration Supabase requise

1. Créer un projet sur [supabase.com](https://supabase.com).
2. Dans le **SQL Editor**, exécuter l'intégralité de `supabase/schema.sql`
   (active PostGIS, crée les tables, triggers et policies RLS).
3. **Authentication > URL Configuration** : renseigner le Site URL et les
   Redirect URLs (`http://localhost:3000/**` en dev) pour que la
   confirmation d'email redirige correctement vers `/auth/callback`.
4. **Storage** : le bucket `payment-proofs` (privé) et ses policies sont
   créés par `schema.sql` lui-même (insert dans `storage.buckets`), rien à
   faire à la main.
5. **Realtime** : `schema.sql` ajoute `orders` et `delivery_tracking` à la
   publication `supabase_realtime` — nécessaire pour le suivi de commande
   en direct (Phase 2).
6. Copier `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et
   `SUPABASE_SERVICE_ROLE_KEY` (Project Settings > API) dans `.env.local`.
7. Pour tester le checkout : insérer manuellement au moins un commerce actif
   avec `zone_id` renseigné, et une ligne dans `bank_transfer_info`
   (`is_active = true`) pour le mode virement — la gestion depuis `/admin`
   arrive en Phase 4.
8. Pour donner accès à l'espace commerce à un compte : `update profiles set
   role = 'commerce' where id = '<uuid>';` puis `update commerces set
   owner_id = '<uuid>' where id = '<commerce_id>';` (flux admin dédié en
   Phase 4). Les produits se gèrent ensuite directement depuis `/commerce/produits`.
9. **Crowd-shipping** : rien à configurer manuellement — `schema.sql` crée
   aussi le bucket public `travel-request-photos` et ses policies.
10. **Escrow crowd-shipping** :
    - Renseigner `bank_transfer_info.flouci_phone` (numéro Flouci de la
      plateforme) pour que l'option Flouci soit utilisable au paiement.
    - Renseigner `FLOUCI_APP_TOKEN` / `FLOUCI_APP_SECRET` dans `.env.local`
      (dashboard Flouci) — sans ça, l'option Flouci reste visible mais
      désactivée avec un message clair. ⚠️ `lib/flouci.ts` n'a jamais été
      testé contre l'API réelle (pas de credentials disponibles) — à vérifier
      contre https://developers.flouci.com avant mise en prod.
    - Pour valider les virements en attente : se connecter avec un compte
      `role = 'admin'` (`update profiles set role = 'admin' where id = '<uuid>'`)
      et aller sur `/admin/jibli-paiements`.
11. **Phase 4 (admin)** : dashboard + `/admin/paiements` (virements commandes)
    + renvoi de preuve côté client après rejet. Nécessite une nouvelle policy
    RLS + un nouveau trigger sur `orders` (`orders_update_client_resubmit_payment`,
    `enforce_client_order_resubmit`) — ré-exécuter `schema.sql`.
12. **Phase 4 suite (CRUD commerces/produits/zones, comptes commerce,
    virement)** : aucune migration SQL (les policies admin déjà en place
    suffisent). Le premier compte admin doit toujours être créé à la main
    (`update profiles set role = 'admin' where id = '<uuid>'`).
13. **Phase 5 — Module 3 (toggle Ouvert/Fermé)** : ré-exécuter `schema.sql`
    (ajoute `commerces.is_open`, `alter table ... add column if not exists`
    donc sans risque sur une base existante). Distinct de `is_active`
    (désactivation par l'admin) : `is_open` est piloté par le commerce
    lui-même depuis `/commerce` et bloque uniquement la prise de nouvelles
    commandes (checkout + UI produits), pas la visibilité de la fiche.
14. **Phase 5 — Module 1 (ETA + signal perdu)** : aucune migration SQL
    (réutilise `delivery_tracking.recorded_at`, déjà présent). ETA estimée
    à partir de la vitesse entre les deux dernières positions reçues (repli
    ~22 km/h si une seule position). Badge "signal perdu" après 3 min sans
    nouvelle position en statut `delivering`, affiché côté client
    (`OrderRealtimeView`, live) et côté admin (`/admin/commandes/[id]`,
    recalculé côté client toutes les 10s à partir de la dernière position
    chargée au rendu de la page).
15. **Phase 5 — Module 2 (fiabilité commerce)** : ré-exécuter `schema.sql`
    (ajoute 5 compteurs + 3 colonnes générées sur `commerces`, et le trigger
    `trg_orders_reliability_stats` sur `orders` — sans risque sur une base
    existante, `add column if not exists`). Rien à configurer : les
    compteurs s'incrémentent automatiquement à chaque commande
    acceptée/refusée/livrée. Seuil "à l'heure" = 45 min depuis la création
    de la commande (constante dans `update_commerce_reliability_stats()`,
    pas de délai promis au client pour l'instant — à ajuster en base si
    besoin d'un seuil différent).
16. **Phase 5 — Module 5 (tarification à la distance)** : ré-exécuter
    `schema.sql` (ajoute `delivery_zones.fee_per_km`, la table
    `zone_surge_rules` + policies admin-only, sans risque sur une base
    existante). `delivery_zones.delivery_fee` devient le **frais de base**
    (le nom de colonne ne change pas, pour ne pas casser
    `orders.delivery_fee`) ; frais final = frais de base + frais/km ×
    distance réelle (Haversine) commerce→client, × majoration heure de
    pointe active (`/admin/zones/[id]`). Distance à vol d'oiseau, pas de
    routage réel (Directions/Distance Matrix) pour éviter une dépendance
    Google Cloud supplémentaire — cf. commentaire dans
    `lib/pricing/deliveryFee.ts`. Zones existantes : `fee_per_km` par
    défaut à 0, donc tarif inchangé tant que l'admin ne le configure pas.
17. **Phase 5 — Module 6 (preuve de livraison + avis publics)** : ré-exécuter
    `schema.sql` (photo obligatoire = nouveau bucket `delivery-proofs` +
    colonne `orders.delivery_proof_url` + trigger
    `enforce_delivery_proof_required` ; avis publics = 3 colonnes agrégées
    sur `commerces` + trigger `trg_ratings_update_commerce_stats` + nouvelle
    policy RLS `ratings_select_public_for_active_commerce` — sans risque sur
    une base existante). Point notable découvert en explorant : la table
    `ratings` existait déjà dans le schéma mais **aucune UI ne permettait de
    noter une commande** — ajouté ici (`RatingForm` sur `/commandes/[id]`
    une fois `delivered`), en plus de l'affichage public sur la fiche
    commerce qui était la seule chose explicitement demandée par ce module.
18. **Phase 5 — Module 7 (pharmacie + ordonnance)** : ré-exécuter
    `schema.sql` (nouvelle valeur d'enum `commerce_category.pharmacie`,
    colonne `products.requires_prescription`, colonne
    `orders.prescription_url`, nouveau bucket privé `prescriptions` — sans
    risque sur une base existante). Pas de nouveau statut de commande : la
    "validation manuelle" de l'ordonnance se fait via le flux
    Accepter/Refuser déjà existant — le commerce (pharmacien) voit la photo
    de l'ordonnance sur `/commerce/commandes/[id]` avant de décider, et
    refuse si elle n'est pas valide/lisible. Pour créer une pharmacie de
    test : catégorie "Pharmacie" sur `/admin/commerces/nouveau`, puis cocher
    "Nécessite une ordonnance" sur les produits concernés depuis
    `/commerce/produits` (visible uniquement pour les commerces de cette
    catégorie).
19. **Phase 5 — Module 8 (parrainage & portefeuille)** : ré-exécuter
    `schema.sql` (colonnes `profiles.referral_code/referred_by/
    referral_reward_granted/wallet_balance`, table `wallet_credits`,
    colonne `orders.wallet_credit_applied`, triggers
    `handle_new_user` (mis à jour), `prevent_wallet_self_edit`,
    `grant_referral_reward`, fonction `debit_wallet` — sans risque sur une
    base existante). Récompense : **5 DT** pour le parrain ET le filleul,
    versés automatiquement à la première commande *livrée* du filleul
    (constante `referral_reward_amount` dans `grant_referral_reward()`,
    ajustable sans downtime). Le crédit ne s'applique qu'aux frais de
    livraison (pas au sous-total), plafonné au solde réel — recalculé côté
    serveur à la validation, jamais fait confiance à un montant client.
    Page client : `/parrainage` (code à partager, solde, historique) — lien
    "Parrainage" dans le header pour les comptes `role='client'`. Le champ
    "code de parrainage" au signup se préremplit depuis `?ref=CODE` dans
    l'URL partagée.
20. **Phase 5 — Module 4 (notifications push + WhatsApp/SMS)** : ré-exécuter
    `schema.sql` (colonne `profiles.onesignal_player_id`, sans risque sur une
    base existante). ⚠️ `lib/onesignal.ts` et `lib/twilio.ts` n'ont jamais
    été testés contre les API réelles (pas de credentials disponibles),
    même traitement que `lib/flouci.ts` — à vérifier contre
    https://documentation.onesignal.com et
    https://www.twilio.com/docs/messaging/api/message-resource avant mise
    en prod. Sans clés configurées, l'app fonctionne normalement : les
    envois sont simplement ignorés silencieusement (best-effort partout,
    aucune notification ratée ne peut faire échouer une commande ou un
    changement de statut). Déclencheurs déjà branchés :
    - Nouvelle commande → push au commerce (`checkout/actions.ts`)
    - Changement de statut → push + WhatsApp/SMS au client
      (`commerce/commandes/actions.ts`, `admin/commandes/actions.ts`)
    Configuration : voir `.env.local.example` (`NEXT_PUBLIC_ONESIGNAL_APP_ID`
    + `ONESIGNAL_REST_API_KEY`, `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` +
    `TWILIO_WHATSAPP_FROM` et/ou `TWILIO_SMS_FROM`). Le service worker
    `public/OneSignalSDKWorker.js` est déjà créé, rien à faire à la main
    côté Supabase Storage/dashboard pour ce module.
21. **Négociation crowd-shipping (`/jibli`)** : ré-exécuter `schema.sql`
    (nouvelle table `travel_proposal_offers`, colonnes
    `travel_proposals.last_offer_by/terms_confirmed_by/terms_confirmed_at/
    updated_at`, RPC `submit_counter_offer`/`agree_to_current_offer`, trigger
    `log_initial_negotiation_offer` — sans risque sur une base existante).
    Un `travel_proposals` est maintenant un **fil de négociation** (contre-
    offres à tour de rôle, historique complet dans `travel_proposal_offers`)
    plutôt qu'une offre figée. Les deux parties peuvent accepter l'offre
    courante, mais pas de la même façon : le **client** accepte en payant
    (`accept_travel_proposal`, inchangée — conclut immédiatement) ; le
    **voyageur** accepte via `agree_to_current_offer` (ne déplace aucun
    argent, verrouille juste le montant et fait apparaître le CTA de
    paiement côté client) — seul le client peut alimenter l'escrow. Pas de
    limite de rounds ni d'expiration automatique.
22. **Connexion avec Google** (`/login`, `/signup`) : ⚠️ nécessite le
    provider Google activé côté **dashboard Supabase**
    (Authentication > Providers > Google) avec un Client ID/Secret
    [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
    — rien à configurer dans ce projet (pas de nouvelle variable dans
    `.env.local`, le secret vit côté Supabase, jamais dans notre serveur).
    Dans Google Cloud Console, l'URI de redirection autorisée est celle de
    **Supabase** (`https://<project-ref>.supabase.co/auth/v1/callback`),
    pas `/auth/callback` de cette app — c'est Supabase qui gère l'échange
    OAuth puis redirige vers notre callback, qui existait déjà (utilisé
    pour la confirmation email, même mécanisme `?code=` → session). Jamais
    testé en direct, pas de credentials disponibles (même réserve que
    `lib/flouci.ts`). Ré-exécuter `schema.sql` n'est pas nécessaire pour ce
    point précis (aucune migration), mais le reste du module 8 (parrainage)
    doit déjà être en place — un compte créé via Google est automatiquement
    orienté vers `/profil/completer` s'il manque le téléphone/l'adresse
    (pas seulement le nom, qui lui est déjà rempli par Google) pour ne pas
    silencieusement sauter la collecte des infos de livraison. Le code de
    parrainage saisi sur `/signup?ref=CODE` est transmis via un cookie de
    courte durée (`signInWithOAuth` ne permet pas d'injecter de métadonnées
    comme le fait `auth.signUp()`), lu et appliqué par `/auth/callback`.

## Google Maps

Créer une clé API dans [Google Cloud Console](https://console.cloud.google.com/)
avec les APIs **Maps JavaScript API** et **Places API** activées, puis la
mettre dans `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`. Restreindre la clé par
référent HTTP (domaine de l'app) avant mise en production.

## Structure

```
app/
  (auth)/          # /login, /signup — Server Actions dans (auth)/actions.ts
  (client)/        # espace client (accueil, commerces, checkout, commandes, jibli/*)
  (commerce)/      # espace commerce (catalogue, commandes reçues, livraison), protégé par middleware.ts
  (admin)/         # espace admin, protégé par middleware.ts
  auth/callback/    # échange du code de confirmation email
  profil/completer/ # complétion de profil post-inscription
components/
  ui/              # composants de base (Button, Input, Card, Badge...)
  auth/, maps/, layout/, cart/, checkout/, orders/
  commerce/          # composants côté client : liste/catalogue d'un commerce
  commerce-dashboard/ # composants côté espace commerce (Phase 3)
  travel/            # crowd-shipping ("Jibli chay men l'a5er")
  admin/             # CRUD commerces/zones/virement, comptes commerce (Phase 4)
lib/
  supabase/        # clients navigateur/serveur/admin + helper middleware
  cart/            # panier client (Context + localStorage, mono-commerce)
  validations/     # schémas zod
  geo.ts, format.ts # distance (Haversine), formatage TND
  flouci.ts        # client API Flouci (paiement escrow crowd-shipping, non testé en direct)
supabase/
  schema.sql       # schéma complet (enums, tables, triggers, RLS)
types/
  database.ts      # types alignés sur schema.sql
```

## État d'avancement

- ✅ Phase 0 — Socle technique
- ✅ Phase 1 — Authentification et profils
- ✅ Phase 2 — Espace client
- ✅ Phase 3 — Espace commerce (catalogue, commandes reçues, livraison)
- ✅ Crowd-shipping ("Jibli chay men l'a5er") — `/jibli`
- ✅ Escrow crowd-shipping (virement testé en direct ; Flouci construit mais non testé — pas de credentials)
- ✅ Phase 4 — Espace admin complète : dashboard, paiements commandes,
  paiements Jibli, CRUD commerces/produits/zones, comptes commerce,
  paramètres virement, supervision globale des commandes (`/admin/commandes`,
  changement de statut et assignation de personnel de livraison hors séquence
  normale pour débloquer un cas particulier).
- 🚧 Phase 5 — en cours :
  - ✅ Module 1 (ETA + alerte signal perdu sur le suivi de commande)
  - ✅ Module 2 (fiabilité commerce : temps moyen, ponctualité, taux d'acceptation)
  - ✅ Module 3 (toggle Ouvert/Fermé — le reste de l'espace commerce existait déjà)
  - ✅ Module 4 (notifications push OneSignal + WhatsApp/SMS Twilio —
    construit sans test en direct, comme Flouci, en attente des identifiants)
  - ✅ Module 5 (tarification à la distance + majorations heure de pointe)
  - ✅ Module 6 (preuve de livraison obligatoire + avis clients publics)
  - ✅ Module 7 (catégorie pharmacie + validation d'ordonnance)
  - ✅ Module 8 (parrainage + portefeuille de crédits)
