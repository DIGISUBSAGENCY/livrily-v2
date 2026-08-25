-- ============================================================================
-- Livrily 2.0 — Schéma de base de données Supabase (Postgres + PostGIS)
-- ============================================================================
-- À exécuter en une fois dans le SQL Editor du dashboard Supabase, sur un
-- projet neuf. Idempotent autant que possible (IF NOT EXISTS) pour pouvoir
-- être ré-appliqué sans tout casser pendant le développement.
--
-- Modèle métier : 2 rôles seulement, client et admin — le "voyageur" n'est
-- pas un rôle distinct, c'est n'importe quel compte client qui propose sur
-- une demande de crowd-shipping (Jibli). Le rôle "commerce" (courses/
-- livraison type supermarché) a existé puis a été retiré intégralement :
-- aucun compte réel ne l'utilisait en prod au moment du retrait (vérifié
-- avant migration). Pas de rôle "livreur" indépendant non plus : côté Jibli,
-- c'est le voyageur lui-même qui livre directement au client.
--
-- Convention monétaire : le dinar tunisien a 3 décimales (millimes), tous
-- les montants utilisent donc numeric(10,3).
--
-- Convention géo : chaque emplacement est stocké à la fois en colonnes
-- lat/lng (double precision, faciles à lire/écrire depuis supabase-js sans
-- manipuler de WKT) ET en colonne geography(Point,4326) tenue à jour par un
-- trigger, pour permettre les requêtes spatiales PostGIS (ST_DWithin,
-- ST_Distance, etc.). C'est le point d'écriture (lat/lng) que l'application
-- utilise ; la colonne geography est dérivée, jamais écrite directement.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Extensions
-- --------------------------------------------------------------------------
create extension if not exists postgis;

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------
-- Retrait de 'commerce' (2 rôles restants : client, admin — le voyageur
-- n'est pas un rôle distinct, cf. plus bas) : appliqué en prod par
-- recréation du type (Postgres ne permet pas de retirer une valeur d'un
-- enum existant), migration exécutée et vérifiée séparément de ce script.
do $$ begin
  create type public.user_role as enum ('client', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'flouci', 'virement');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- Fonctions utilitaires (créées avant les tables/triggers qui les utilisent)
-- --------------------------------------------------------------------------

-- Met à jour automatiquement la colonne updated_at sur UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Vérifie si l'utilisateur courant (auth.uid()) est admin.
-- SECURITY DEFINER + propriétaire = postgres (owner de la table profiles) :
-- la fonction contourne donc RLS en interne pour lire profiles.role sans
-- provoquer de récursion de policy, tout en ne renvoyant qu'un booléen.
--
-- language plpgsql (et non sql) volontairement : une fonction "language sql"
-- est analysée et résolue à la CRÉATION (les tables référencées doivent déjà
-- exister), alors que plpgsql ne résout ses requêtes qu'à l'EXÉCUTION. Cette
-- fonction est définie avant que `profiles` n'existe plus bas dans ce
-- script — plpgsql est donc nécessaire ici, pas juste un style.
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$;

-- ============================================================================
-- Table: profiles
-- Une ligne par utilisateur Supabase Auth (id = auth.users.id), tous rôles.
-- ============================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'client',
  email text,
  full_name text,
  phone text,
  address text,
  country text, -- code pays (ex: 'TN'), liste dans lib/constants/countries.ts
  profession text, -- libre, optionnel
  address_lat double precision,
  address_lng double precision,
  address_location geography(Point, 4326),
  is_active boolean not null default true, -- désactivation de compte par l'admin (tous rôles)
  -- Phase 5 — Module 8 : parrainage. referral_code généré automatiquement à
  -- l'inscription (handle_new_user ci-dessous) pour CHAQUE profil, pas
  -- seulement ceux qui parrainent effectivement quelqu'un. wallet_balance
  -- et les champs referral_* ne sont éditables que par le système (triggers
  -- security definer / client admin), jamais en libre-service — cf.
  -- prevent_wallet_self_edit ci-dessous.
  referral_code text unique,
  referred_by uuid references public.profiles(id),
  referral_reward_granted boolean not null default false,
  wallet_balance numeric not null default 0,
  -- Phase 5 — Module 4 : identifiant d'abonnement push OneSignal (côté
  -- navigateur), renseigné par components/notifications/OneSignalInit.tsx.
  -- Champ non sensible (pas de garde-fou prevent_wallet_self_edit
  -- nécessaire) : juste un jeton d'appareil, déjà éditable par son
  -- propriétaire via la policy profiles_update_own_or_admin existante.
  onesignal_player_id text,
  -- Tour guidé (4 étapes) affiché une seule fois à la première connexion
  -- client (cf. app/(client)/jibli/page.tsx) — null = jamais vu.
  onboarding_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);
alter table public.profiles add column if not exists referral_reward_granted boolean not null default false;
alter table public.profiles add column if not exists wallet_balance numeric not null default 0;
alter table public.profiles add column if not exists onesignal_player_id text;
alter table public.profiles add column if not exists country text;
alter table public.profiles add column if not exists profession text;
alter table public.profiles add column if not exists onboarding_seen_at timestamptz;
-- Page /profil (bandeau + avatar + présentation) — cf. bucket profile-photos
-- plus bas dans ce fichier pour le stockage des images elles-mêmes.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists bio text;

create index if not exists profiles_role_idx on public.profiles(role);

create or replace function public.sync_profile_location()
returns trigger
language plpgsql
as $$
begin
  if new.address_lat is not null and new.address_lng is not null then
    new.address_location = ST_SetSRID(ST_MakePoint(new.address_lng, new.address_lat), 4326)::geography;
  else
    new.address_location = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_sync_location on public.profiles;
create trigger trg_profiles_sync_location
  before insert or update of address_lat, address_lng on public.profiles
  for each row execute function public.sync_profile_location();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Empêche un utilisateur non-admin de changer son propre rôle (élévation de
-- privilèges) via une simple requête UPDATE autorisée par la policy RLS
-- "je peux modifier mon propre profil".
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier le rôle d''un profil.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_prevent_role_escalation on public.profiles;
create trigger trg_profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- Phase 5 — Module 8 : même logique que prevent_role_self_escalation
-- ci-dessus, appliquée aux champs du parrainage/portefeuille — sans ce
-- garde-fou, la policy "je peux modifier mon propre profil" laisserait
-- n'importe quel client s'auto-créditer via une simple requête UPDATE.
-- Les écritures légitimes (via le client admin, service role) contournent
-- ce trigger : NULL = old.id est toujours faux, auth.uid() n'existe pas pour
-- une connexion service role. grant_referral_reward() (cf. plus haut,
-- fonction orpheline en attente d'un déclencheur Jibli) suivait la même
-- logique côté security definer quand son trigger existait encore.
create or replace function public.prevent_wallet_self_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id and not public.is_admin() then
    if new.wallet_balance is distinct from old.wallet_balance
       or new.referred_by is distinct from old.referred_by
       or new.referral_reward_granted is distinct from old.referral_reward_granted
       or new.referral_code is distinct from old.referral_code
    then
      raise exception 'Ces champs sont gérés automatiquement et ne peuvent pas être modifiés directement.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_prevent_wallet_self_edit on public.profiles;
create trigger trg_profiles_prevent_wallet_self_edit
  before update on public.profiles
  for each row execute function public.prevent_wallet_self_edit();

-- Crée automatiquement le profil (rôle client par défaut) à l'inscription,
-- avec un code de parrainage unique et, si un code valide a été saisi au
-- signup (raw_user_meta_data->>'referral_code_used'), le lien vers le
-- parrain. Le rôle admin est attribué manuellement ensuite (le self-service
-- signup ne crée jamais autre chose qu'un compte client).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  submitted_code text;
  referrer_id uuid;
begin
  loop
    new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = new_code);
  end loop;

  submitted_code := nullif(upper(trim(new.raw_user_meta_data->>'referral_code_used')), '');
  if submitted_code is not null then
    select id into referrer_id from public.profiles where referral_code = submitted_code;
  end if;

  insert into public.profiles (id, email, full_name, referral_code, referred_by)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new_code, referrer_id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Table: wallet_credits
-- Phase 5 — Module 8 : journal (append-only) des mouvements du portefeuille
-- de chaque profil — positif = crédit (récompense de parrainage), négatif =
-- débit (utilisation au checkout). profiles.wallet_balance est le solde
-- courant, entretenu par les mêmes écritures système que ce journal (jamais
-- recalculé par somme à la lecture, comme les autres compteurs de ce fichier).
-- ============================================================================
create table if not exists public.wallet_credits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  amount numeric not null,
  reason text not null check (reason in ('referral_referrer', 'referral_referred', 'checkout_redemption')),
  -- order_id référençait public.orders (supprimée, cf. suppression du rôle
  -- commerce) : la FK a disparu avec la table (CASCADE), colonne conservée
  -- telle quelle en attendant une décision sur le parrainage (cf.
  -- grant_referral_reward ci-dessous, volontairement laissée orpheline pour
  -- l'instant — discussion séparée, pas traitée dans ce nettoyage). La
  -- valeur 'checkout_redemption' de `reason` est également orpheline (plus
  -- aucun code n'insère avec cette raison), laissée telle quelle : coûte
  -- rien, ne bloque rien.
  order_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists wallet_credits_profile_idx on public.wallet_credits(profile_id);

-- Fonction ORPHELINE, volontairement laissée telle quelle (décision mise de
-- côté, à traiter séparément — cf. discussion suppression commerce) : c'est
-- le SEUL mécanisme de versement de récompense de parrainage existant, et
-- il ne se déclenchait que sur `orders` (transition delivering → delivered),
-- table supprimée avec le rôle commerce. Son trigger (trg_orders_referral_
-- reward, sur orders) a disparu par CASCADE en même temps que la table ;
-- il n'est donc plus recréé ici. Tant qu'aucun déclencheur équivalent n'est
-- rattaché à une completion Jibli (travel_requests.status = 'completed'),
-- le parrainage génère/partage toujours des codes mais ne verse plus aucune
-- récompense. Fonction gardée intacte pour référence/adaptation future.
create or replace function public.grant_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referral_reward_amount constant numeric := 5; -- DT, pour le parrain ET le filleul
  v_referred_by uuid;
  v_already_granted boolean;
begin
  if old.status = 'delivering' and new.status = 'delivered' then
    select referred_by, referral_reward_granted into v_referred_by, v_already_granted
    from public.profiles where id = new.client_id;

    if v_referred_by is not null and not v_already_granted then
      update public.profiles set wallet_balance = wallet_balance + referral_reward_amount
      where id = v_referred_by;
      insert into public.wallet_credits (profile_id, amount, reason, order_id)
      values (v_referred_by, referral_reward_amount, 'referral_referrer', new.id);

      update public.profiles
      set wallet_balance = wallet_balance + referral_reward_amount, referral_reward_granted = true
      where id = new.client_id;
      insert into public.wallet_credits (profile_id, amount, reason, order_id)
      values (new.client_id, referral_reward_amount, 'referral_referred', new.id);
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================================
-- Table: bank_transfer_info
-- Coordonnées bancaires affichées au client au checkout pour le virement.
-- ============================================================================
create table if not exists public.bank_transfer_info (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_holder text not null,
  rib text not null,
  iban text,
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_bank_transfer_updated_at on public.bank_transfer_info;
create trigger trg_bank_transfer_updated_at
  before update on public.bank_transfer_info
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.bank_transfer_info enable row level security;
alter table public.wallet_credits enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (id = auth.uid() or public.is_admin());
  -- Le changement de rôle est bloqué par le trigger prevent_role_self_escalation
  -- même si cette policy autorise la mise à jour de la ligne.

-- wallet_credits ------------------------------------------------------------
-- Lecture seule pour le client (historique de son propre portefeuille) :
-- aucune policy d'insert/update/delete pour un rôle authentifié normal —
-- toutes les écritures passent par grant_referral_reward() (security
-- definer, contourne RLS) ou par le client admin au checkout (service role,
-- contourne aussi RLS). Voir prevent_wallet_self_edit sur profiles pour la
-- même logique appliquée à wallet_balance directement.
drop policy if exists "wallet_credits_select_own_or_admin" on public.wallet_credits;
create policy "wallet_credits_select_own_or_admin"
  on public.wallet_credits for select
  using (profile_id = auth.uid() or public.is_admin());

-- bank_transfer_info ----------------------------------------------------------
drop policy if exists "bank_transfer_select_authenticated" on public.bank_transfer_info;
create policy "bank_transfer_select_authenticated"
  on public.bank_transfer_info for select
  using (auth.uid() is not null);

drop policy if exists "bank_transfer_write_admin" on public.bank_transfer_info;
create policy "bank_transfer_write_admin"
  on public.bank_transfer_info for insert
  with check (public.is_admin());

drop policy if exists "bank_transfer_update_admin" on public.bank_transfer_info;
create policy "bank_transfer_update_admin"
  on public.bank_transfer_info for update
  using (public.is_admin());

-- ============================================================================
-- Storage : bucket payment-proofs (preuves de virement bancaire)
-- ============================================================================
-- Un bucket Supabase Storage n'est qu'une ligne dans storage.buckets : on
-- peut donc le créer ici en SQL plutôt qu'à la main dans le dashboard.
-- Privé (public = false), limité à 5 Mo, images uniquement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- RLS est déjà activé par défaut sur storage.objects dans tout projet
-- Supabase. Convention de chemin : {user_id}/{order_id}.jpg — le premier
-- segment du chemin (storage.foldername) doit être l'id de l'utilisateur.
drop policy if exists "payment_proofs_insert_own_folder" on storage.objects;
create policy "payment_proofs_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "payment_proofs_select_own_or_admin" on storage.objects;
create policy "payment_proofs_select_own_or_admin"
  on storage.objects for select
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- ============================================================================
-- Crowd-shipping ("Jibli chay men l'a5er")
-- ============================================================================
-- Un client publie une demande pour qu'on lui ramène un objet de l'étranger, un
-- voyageur (n'importe quel autre compte role='client', pas de rôle dédié)
-- propose de le lui ramener. Le client accepte UNE proposition ; le
-- voyageur accepté fait ensuite avancer le statut jusqu'à la remise.
-- Devise : TND partout, comme le reste de l'app (pas de multi-devise).
-- ============================================================================

do $$ begin
  create type public.travel_request_status as enum ('open', 'matched', 'in_transit', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.travel_proposal_status as enum ('pending', 'accepted', 'rejected', 'withdrawn');
exception when duplicate_object then null; end $$;

-- Déclaré ici (avant les tables travel_payments/withdrawal_requests plus
-- bas) parce que accept_travel_proposal() et confirm_travel_receipt()
-- déclarent une variable de ce type dans leur DECLARE : contrairement aux
-- requêtes SQL internes à une fonction plpgsql (résolues à l'exécution, cf.
-- note sur is_admin() plus haut), le TYPE d'une variable déclarée doit,
-- lui, exister au moment de la création de la fonction.
do $$ begin
  create type public.travel_payment_status as enum ('awaiting_verification', 'escrowed', 'released', 'refunded');
exception when duplicate_object then null; end $$;

-- Miroir de is_admin() : vérifie que l'utilisateur courant a le rôle client
-- (ce marketplace est réservé aux comptes client, pas admin).
create or replace function public.is_client()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'client'
  );
end;
$$;

-- Les 3 fonctions ci-dessous existent UNIQUEMENT pour éviter une récursion
-- RLS infinie : la policy SELECT de travel_requests a besoin de vérifier
-- l'existence d'une ligne dans travel_proposals, et la policy SELECT de
-- travel_proposals a besoin de vérifier l'existence d'une ligne dans
-- travel_requests. Écrites en sous-requêtes brutes directement dans les
-- `using (...)`, ces vérifications croisées déclenchent chacune la policy
-- de l'autre table, qui redéclenche la première, etc. (erreur Postgres
-- 42P17 "infinite recursion detected in policy"). En passant par une
-- fonction SECURITY DEFINER (même principe que is_admin() plus haut), la
-- requête interne s'exécute avec les privilèges du
-- propriétaire de la table (postgres), qui est exempté de RLS — la boucle
-- ne se déclenche donc jamais.
create or replace function public.has_proposal_on_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.travel_proposals
    where request_id = p_request_id and voyageur_id = auth.uid()
  );
end;
$$;

create or replace function public.owns_travel_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.travel_requests
    where id = p_request_id and client_id = auth.uid()
  );
end;
$$;

create or replace function public.is_accepted_voyageur_for_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.travel_proposals tp
    join public.travel_requests tr on tr.id = tp.request_id
    where tr.id = p_request_id and tp.id = tr.accepted_proposal_id and tp.voyageur_id = auth.uid()
  );
end;
$$;

-- ============================================================================
-- Table: travel_requests
-- ============================================================================
create table if not exists public.travel_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  item_description text not null,
  item_url text,
  item_photo_url text, -- chemin storage bucket travel-request-photos
  origin_country text not null,
  destination_city text not null,
  budget_max numeric(10,3) not null check (budget_max >= 0),
  needed_by date,
  status public.travel_request_status not null default 'open',
  -- FK ajoutée plus bas (dépendance circulaire avec travel_proposals, qui
  -- référence travel_requests) : la colonne existe ici, la contrainte après.
  accepted_proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_requests_status_idx on public.travel_requests(status);
create index if not exists travel_requests_client_idx on public.travel_requests(client_id);
create index if not exists travel_requests_origin_idx on public.travel_requests(origin_country);
create index if not exists travel_requests_destination_idx on public.travel_requests(destination_city);
create index if not exists travel_requests_accepted_proposal_idx on public.travel_requests(accepted_proposal_id);

drop trigger if exists trg_travel_requests_updated_at on public.travel_requests;
create trigger trg_travel_requests_updated_at
  before update on public.travel_requests
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Table: travel_proposals
-- ============================================================================
create table if not exists public.travel_proposals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.travel_requests(id) on delete cascade,
  voyageur_id uuid not null references public.profiles(id),
  item_price numeric(10,3) not null check (item_price >= 0), -- remboursé au voyageur, pas une commission
  delivery_fee numeric(10,3) not null check (delivery_fee >= 0), -- seul montant sur lequel une commission plateforme sera prélevée (taux à définir, phase admin future)
  travel_date date,
  message text,
  pickup_city text, -- ville de départ du voyageur pour ce trajet (ex: Lyon), pas la ville de remise au client
  expires_at timestamptz, -- validité affichée de l'offre ("Valable jusqu'au...") — purement informatif, aucune expiration automatique pour l'instant
  status public.travel_proposal_status not null default 'pending',
  -- Phase 5 — négociation : item_price/delivery_fee/message représentent
  -- désormais l'OFFRE COURANTE du fil (historique complet dans
  -- travel_proposal_offers ci-dessous), plus l'offre figée à la création.
  -- last_offer_by : qui a parlé en dernier (default 'voyageur' car la
  -- création d'une proposition est toujours son premier coup, cf.
  -- log_initial_negotiation_offer plus bas). terms_confirmed_by/at : posé
  -- uniquement par agree_to_current_offer() (toujours le voyageur — le
  -- client, lui, "accepte" en payant directement via accept_travel_proposal,
  -- qui reste inchangée) ; remis à null par tout nouveau submit_counter_offer.
  last_offer_by text not null default 'voyageur' check (last_offer_by in ('client', 'voyageur')),
  terms_confirmed_by uuid references public.profiles(id),
  terms_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, voyageur_id) -- un seul FIL de négociation par voyageur et par demande (même après retrait)
);

alter table public.travel_proposals add column if not exists last_offer_by text not null default 'voyageur' check (last_offer_by in ('client', 'voyageur'));
alter table public.travel_proposals add column if not exists terms_confirmed_by uuid references public.profiles(id);
alter table public.travel_proposals add column if not exists terms_confirmed_at timestamptz;
alter table public.travel_proposals add column if not exists updated_at timestamptz not null default now();
alter table public.travel_proposals add column if not exists pickup_city text;
alter table public.travel_proposals add column if not exists expires_at timestamptz;

create index if not exists travel_proposals_request_idx on public.travel_proposals(request_id);
create index if not exists travel_proposals_voyageur_idx on public.travel_proposals(voyageur_id);
create index if not exists travel_proposals_status_idx on public.travel_proposals(status);

drop trigger if exists trg_travel_proposals_updated_at on public.travel_proposals;
create trigger trg_travel_proposals_updated_at
  before update on public.travel_proposals
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Table: travel_proposal_offers
-- Fil de négociation (append-only) d'un travel_proposals donné : chaque
-- tour (contre-offre ou accord) y laisse une trace. Écriture réservée aux
-- RPC submit_counter_offer()/agree_to_current_offer() et au trigger
-- log_initial_negotiation_offer() (le tout premier coup, à la création de
-- la proposition) — même principe que wallet_credits : aucune policy
-- d'insert pour un rôle authentifié, tout passe par du security definer.
-- ============================================================================
create table if not exists public.travel_proposal_offers (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.travel_proposals(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  author_role text not null check (author_role in ('client', 'voyageur')),
  item_price numeric(10,3) not null check (item_price >= 0),
  delivery_fee numeric(10,3) not null check (delivery_fee >= 0),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists travel_proposal_offers_proposal_idx on public.travel_proposal_offers(proposal_id, created_at);

-- Enregistre automatiquement le tout premier coup du fil : la proposition
-- elle-même, créée par le voyageur via l'INSERT existant dans
-- app/(client)/jibli/[id]/actions.ts (createProposal, inchangée).
create or replace function public.log_initial_negotiation_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.travel_proposal_offers (proposal_id, author_id, author_role, item_price, delivery_fee, message, created_at)
  values (new.id, new.voyageur_id, 'voyageur', new.item_price, new.delivery_fee, new.message, new.created_at);
  return new;
end;
$$;

drop trigger if exists trg_travel_proposals_log_initial_offer on public.travel_proposals;
create trigger trg_travel_proposals_log_initial_offer
  after insert on public.travel_proposals
  for each row execute function public.log_initial_negotiation_offer();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'travel_requests_accepted_proposal_fkey') then
    alter table public.travel_requests
      add constraint travel_requests_accepted_proposal_fkey
      foreign key (accepted_proposal_id) references public.travel_proposals(id);
  end if;
end $$;

-- Restreint ce qu'un acteur non-admin peut modifier sur une demande :
--   - le client (propriétaire) : uniquement annuler (open → cancelled)
--   - le voyageur dont la proposition a été acceptée : uniquement faire
--     avancer le statut matched → in_transit → completed
-- Tout le reste (montants, description...) est immuable après création.
-- Le flag de session jibli.bypass_transition_checks permet à la fonction
-- accept_travel_proposal() (SECURITY DEFINER) d'écrire malgré ce trigger :
-- SECURITY DEFINER contourne les policies RLS, pas les triggers, qui
-- s'exécutent toujours — d'où ce mécanisme de bypass explicite et scopé à
-- la transaction (set_config(..., true) = local à la transaction en cours).
create or replace function public.enforce_travel_request_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_accepted_voyageur boolean;
begin
  -- Timestampe précisément le moment où le voyageur déclare la livraison
  -- faite — nécessaire pour la libération automatique après délai
  -- (auto_release_stale_payments ci-dessous) : sans cette colonne, aucun
  -- champ ne capture ce moment (updated_at est réécrit par toute écriture
  -- ultérieure, y compris confirm_travel_receipt() lui-même). Posé AVANT
  -- les branches bypass/admin ci-dessous pour s'appliquer uniformément,
  -- quel que soit l'acteur qui déclenche la transition.
  if old.status = 'in_transit' and new.status = 'completed' then
    new.completed_at := now();
  end if;

  if coalesce(current_setting('jibli.bypass_transition_checks', true), 'false') = 'true' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  v_is_accepted_voyageur := exists (
    select 1 from public.travel_proposals tp
    where tp.id = old.accepted_proposal_id and tp.voyageur_id = auth.uid()
  );

  if old.client_id = auth.uid() then
    if new.status is distinct from old.status and not (old.status = 'open' and new.status = 'cancelled') then
      raise exception 'Transition de statut invalide pour le client : % → %', old.status, new.status;
    end if;
    if new.accepted_proposal_id is distinct from old.accepted_proposal_id then
      raise exception 'L''acceptation d''une proposition passe par accept_travel_proposal().';
    end if;
  elsif v_is_accepted_voyageur then
    if new.status is distinct from old.status and not (
      (old.status = 'matched' and new.status = 'in_transit')
      or (old.status = 'in_transit' and new.status = 'completed')
    ) then
      raise exception 'Transition de statut invalide pour le voyageur : % → %', old.status, new.status;
    end if;
    if new.accepted_proposal_id is distinct from old.accepted_proposal_id then
      raise exception 'Le voyageur ne peut pas modifier la proposition acceptée.';
    end if;
  else
    raise exception 'Non autorisé à modifier cette demande.';
  end if;

  if new.client_id is distinct from old.client_id
     or new.item_description is distinct from old.item_description
     or new.item_url is distinct from old.item_url
     or new.item_photo_url is distinct from old.item_photo_url
     or new.origin_country is distinct from old.origin_country
     or new.destination_city is distinct from old.destination_city
     or new.budget_max is distinct from old.budget_max
     or new.needed_by is distinct from old.needed_by
  then
    raise exception 'Seul le statut (et l''acceptation via accept_travel_proposal) peut être modifié.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_travel_requests_transitions on public.travel_requests;
create trigger trg_travel_requests_transitions
  before update on public.travel_requests
  for each row execute function public.enforce_travel_request_transitions();

-- Idem côté proposition : seul un retrait (pending → withdrawn) par le
-- voyageur lui-même est permis en écriture directe. Le passage à
-- accepted/rejected se fait exclusivement via accept_travel_proposal().
create or replace function public.enforce_travel_proposal_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('jibli.bypass_transition_checks', true), 'false') = 'true' then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.voyageur_id is distinct from old.voyageur_id
     or new.request_id is distinct from old.request_id
     or new.item_price is distinct from old.item_price
     or new.delivery_fee is distinct from old.delivery_fee
     or new.travel_date is distinct from old.travel_date
     or new.message is distinct from old.message
     -- Négociation : ces trois champs ne doivent bouger que via
     -- submit_counter_offer()/agree_to_current_offer() (bypass flag ci-
     -- dessus) — sans ce garde-fou, un voyageur pourrait se faire passer
     -- pour "accepté" via un simple .update() côté client.
     or new.last_offer_by is distinct from old.last_offer_by
     or new.terms_confirmed_by is distinct from old.terms_confirmed_by
     or new.terms_confirmed_at is distinct from old.terms_confirmed_at
  then
    raise exception 'Seul le retrait (status → withdrawn) peut être modifié directement.';
  end if;

  if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'withdrawn') then
    raise exception 'Transition de statut invalide : % → % (l''acceptation passe par accept_travel_proposal).', old.status, new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_travel_proposals_update on public.travel_proposals;
create trigger trg_travel_proposals_update
  before update on public.travel_proposals
  for each row execute function public.enforce_travel_proposal_update();

-- Phase 5 — négociation : dépose une contre-offre sur un fil existant.
-- Seule la partie à qui "c'est le tour" peut agir (impossible de
-- contre-proposer sur sa propre dernière offre). Verrou FOR UPDATE +
-- bypass flag, même schéma que accept_travel_proposal plus bas.
create or replace function public.submit_counter_offer(
  p_proposal_id uuid,
  p_item_price numeric,
  p_delivery_fee numeric,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_voyageur_id uuid;
  v_status public.travel_proposal_status;
  v_request_status public.travel_request_status;
  v_last_offer_by text;
  v_caller_role text;
begin
  select tp.request_id, tp.voyageur_id, tp.status, tp.last_offer_by, tr.client_id, tr.status
    into v_request_id, v_voyageur_id, v_status, v_last_offer_by, v_client_id, v_request_status
  from public.travel_proposals tp
  join public.travel_requests tr on tr.id = tp.request_id
  where tp.id = p_proposal_id
  for update of tp, tr;

  if v_request_id is null then
    raise exception 'Proposition introuvable.';
  end if;

  if auth.uid() = v_voyageur_id then
    v_caller_role := 'voyageur';
  elsif auth.uid() = v_client_id then
    v_caller_role := 'client';
  else
    raise exception 'Non autorisé à négocier sur cette proposition.';
  end if;

  if v_status <> 'pending' then
    raise exception 'Cette négociation n''est plus active.';
  end if;
  if v_request_status <> 'open' then
    raise exception 'Cette demande n''est plus ouverte.';
  end if;
  if v_last_offer_by = v_caller_role then
    raise exception 'C''est à l''autre partie de répondre en premier.';
  end if;

  insert into public.travel_proposal_offers (proposal_id, author_id, author_role, item_price, delivery_fee, message)
  values (p_proposal_id, auth.uid(), v_caller_role, p_item_price, p_delivery_fee, p_message);

  perform set_config('jibli.bypass_transition_checks', 'true', true);

  update public.travel_proposals
  set item_price = p_item_price,
      delivery_fee = p_delivery_fee,
      message = p_message,
      last_offer_by = v_caller_role,
      terms_confirmed_by = null,
      terms_confirmed_at = null
  where id = p_proposal_id;

  perform set_config('jibli.bypass_transition_checks', 'false', true);
end;
$$;

grant execute on function public.submit_counter_offer(uuid, numeric, numeric, text) to authenticated;

-- Accord du voyageur sur l'offre courante du client : ne déplace AUCUN
-- argent (seule accept_travel_proposal, appelée par le client avec un
-- paiement, conclut réellement) — verrouille juste les termes et fait
-- apparaître côté client un CTA de paiement sur ce montant déjà validé.
create or replace function public.agree_to_current_offer(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voyageur_id uuid;
  v_status public.travel_proposal_status;
  v_request_status public.travel_request_status;
  v_last_offer_by text;
begin
  select tp.voyageur_id, tp.status, tp.last_offer_by, tr.status
    into v_voyageur_id, v_status, v_last_offer_by, v_request_status
  from public.travel_proposals tp
  join public.travel_requests tr on tr.id = tp.request_id
  where tp.id = p_proposal_id
  for update of tp;

  if v_voyageur_id is null then
    raise exception 'Proposition introuvable.';
  end if;
  if auth.uid() <> v_voyageur_id then
    raise exception 'Seul le voyageur peut accepter l''offre du client de cette façon (le client accepte en payant).';
  end if;
  if v_status <> 'pending' then
    raise exception 'Cette négociation n''est plus active.';
  end if;
  if v_request_status <> 'open' then
    raise exception 'Cette demande n''est plus ouverte.';
  end if;
  if v_last_offer_by <> 'client' then
    raise exception 'Il n''y a pas d''offre du client en attente sur ce fil.';
  end if;

  perform set_config('jibli.bypass_transition_checks', 'true', true);

  update public.travel_proposals
  set terms_confirmed_by = auth.uid(), terms_confirmed_at = now()
  where id = p_proposal_id;

  perform set_config('jibli.bypass_transition_checks', 'false', true);
end;
$$;

grant execute on function public.agree_to_current_offer(uuid) to authenticated;

-- Accepte UNE proposition de façon atomique : la proposition choisie passe
-- accepted, toutes les autres propositions pending de la même demande
-- passent rejected, la demande passe matched, ET un enregistrement de
-- paiement séquestre (travel_payments) est créé dans la même transaction.
-- Fait en une seule fonction (verrou FOR UPDATE inclus) plutôt qu'en
-- plusieurs updates séquentiels côté application, pour ne jamais laisser un
-- état intermédiaire incohérent en cas d'échec partiel.
--
-- Deux modes d'appel, selon p_payment_method :
--   - 'virement' : appelée directement par la Server Action après upload de
--     la preuve. travel_payments démarre à 'awaiting_verification' — un
--     admin doit encore valider (voir /admin/jibli-paiements).
--   - 'flouci' : appelée uniquement par le Route Handler de callback,
--     après confirmation du paiement par l'API Flouci (lib/flouci.ts).
--     travel_payments démarre directement à 'escrowed' — aucune vérification
--     admin nécessaire, l'API Flouci a déjà fait office de tiers de confiance.
-- ============================================================================
-- Table: platform_settings
-- Ligne unique (singleton) de paramètres plateforme configurables depuis
-- /admin/parametres/commission — jusqu'ici accept_travel_proposal() avait un
-- taux de commission Jibli (affiché "Livrily" côté admin, cf. cette page)
-- câblé en dur à 0%. "id boolean primary key default true check (id)" est
-- un pattern Postgres standard pour forcer une table à ne jamais contenir
-- plus d'une ligne (seule la valeur `true` est autorisée comme clé).
-- ============================================================================
create table if not exists public.platform_settings (
  id boolean primary key default true,
  travel_commission_rate numeric(5,4) not null default 0.10 check (travel_commission_rate >= 0 and travel_commission_rate <= 1),
  -- Délai de libération automatique des fonds séquestrés si le client ne
  -- confirme jamais réception (cf. auto_release_stale_payments plus bas),
  -- éditable depuis /admin/parametres/liberation-automatique — même logique
  -- que travel_commission_rate : configurable plutôt que câblé en dur.
  auto_release_delay_days integer not null default 7 check (auto_release_delay_days > 0),
  -- Boost payant (Phase 3, brique 5/N) — un seul palier configurable pour
  -- la v1 (pas de paliers 1/3/7 jours : rien à ce jour pour calibrer
  -- lequel aurait du sens, ajoutable plus tard sans réécriture de schéma),
  -- même logique que travel_commission_rate/auto_release_delay_days.
  boost_price_tnd numeric(10,3) not null default 5 check (boost_price_tnd >= 0),
  boost_duration_days integer not null default 3 check (boost_duration_days > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint platform_settings_singleton check (id)
);

alter table public.platform_settings add column if not exists auto_release_delay_days integer not null default 7 check (auto_release_delay_days > 0);
alter table public.platform_settings add column if not exists boost_price_tnd numeric(10,3) not null default 5 check (boost_price_tnd >= 0);
alter table public.platform_settings add column if not exists boost_duration_days integer not null default 3 check (boost_duration_days > 0);

insert into public.platform_settings (id, travel_commission_rate)
values (true, 0.10)
on conflict (id) do nothing;

drop trigger if exists trg_platform_settings_updated_at on public.platform_settings;
create trigger trg_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

drop policy if exists "platform_settings_select_admin_only" on public.platform_settings;
create policy "platform_settings_select_admin_only"
  on public.platform_settings for select
  using (public.is_admin());

drop policy if exists "platform_settings_update_admin_only" on public.platform_settings;
create policy "platform_settings_update_admin_only"
  on public.platform_settings for update
  using (public.is_admin());

drop function if exists public.accept_travel_proposal(uuid);
create or replace function public.accept_travel_proposal(
  p_proposal_id uuid,
  p_payment_method public.payment_method,
  p_payment_proof_url text default null,
  p_payment_ref text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_request_status public.travel_request_status;
  v_client_id uuid;
  v_voyageur_id uuid;
  v_proposal_status public.travel_proposal_status;
  v_item_price numeric(10,3);
  v_delivery_fee numeric(10,3);
  v_source_trip_id uuid;
  v_amount numeric(10,3);
  v_commission numeric(10,3);
  v_commission_rate numeric(5,4);
  v_payment_status public.travel_payment_status;
begin
  if p_payment_method not in ('virement', 'flouci') then
    raise exception 'Méthode de paiement invalide pour le séquestre : % (cash exclu, aucune garde possible).', p_payment_method;
  end if;

  select tp.request_id, tp.status, tr.status, tr.client_id, tp.voyageur_id, tp.item_price, tp.delivery_fee, tp.source_trip_id
    into v_request_id, v_proposal_status, v_request_status, v_client_id, v_voyageur_id, v_item_price, v_delivery_fee, v_source_trip_id
  from public.travel_proposals tp
  join public.travel_requests tr on tr.id = tp.request_id
  where tp.id = p_proposal_id
  for update of tr, tp;

  if v_request_id is null then
    raise exception 'Proposition introuvable.';
  end if;
  if v_client_id <> auth.uid() then
    raise exception 'Seul le client propriétaire de la demande peut accepter une proposition.';
  end if;
  if v_request_status <> 'open' then
    raise exception 'Cette demande n''est plus ouverte.';
  end if;
  if v_proposal_status <> 'pending' then
    raise exception 'Cette proposition n''est plus en attente.';
  end if;

  if p_payment_method = 'virement' then
    if p_payment_proof_url is null then
      raise exception 'Preuve de virement manquante.';
    end if;
    v_payment_status := 'awaiting_verification';
  else
    if p_payment_ref is null then
      raise exception 'Référence de paiement Flouci manquante.';
    end if;
    v_payment_status := 'escrowed';
  end if;

  -- Taux configurable depuis /admin/parametres/commission (platform_settings,
  -- singleton) — auparavant câblé en dur à 0%. coalesce en garde-fou si la
  -- ligne singleton venait à manquer (ne devrait jamais arriver, seedée
  -- ci-dessus), pour ne jamais faire échouer une acceptation de proposition
  -- à cause d'un paramètre de facturation manquant.
  select travel_commission_rate into v_commission_rate from public.platform_settings where id = true;
  v_amount := v_item_price + v_delivery_fee;
  v_commission := v_delivery_fee * coalesce(v_commission_rate, 0);

  perform set_config('jibli.bypass_transition_checks', 'true', true);

  update public.travel_proposals set status = 'accepted' where id = p_proposal_id;
  update public.travel_proposals set status = 'rejected'
    where request_id = v_request_id and id <> p_proposal_id and status = 'pending';
  update public.travel_requests set status = 'matched', accepted_proposal_id = p_proposal_id
    where id = v_request_id;

  insert into public.travel_payments (
    request_id, payment_method, payment_proof_url, payment_ref, amount, commission_amount, status
  ) values (
    v_request_id, p_payment_method, p_payment_proof_url, p_payment_ref, v_amount, v_commission, v_payment_status
  );

  -- Trips (Phase 3, brique 2/N) : si cette proposition vient d'un match
  -- (source_trip_id posé à sa création), c'est ICI que la mise en
  -- relation "un trip = une seule à la fois" se concrétise — la seule
  -- écriture de tout ce chantier qui fait passer un trip à 'matched'.
  -- 'open' dans le where : ne fait rien si le trip a déjà été utilisé par
  -- une autre proposition entre-temps (garde-fou silencieux, pas une
  -- erreur bloquante pour le client qui accepte). 'voyageur_id =
  -- v_voyageur_id' : source_trip_id vient d'un champ caché de formulaire
  -- côté TypeScript, donc falsifiable côté client — sans ce contrôle de
  -- propriété, un voyageur malveillant pourrait pointer vers le trip d'un
  -- AUTRE voyageur, qui se retrouverait 'matched' par une proposition qui
  -- n'est pas la sienne. Trouvé en concevant createProposal, pas exploité
  -- en prod.
  if v_source_trip_id is not null then
    update public.trips set status = 'matched', matched_proposal_id = p_proposal_id
      where id = v_source_trip_id and status = 'open' and voyageur_id = v_voyageur_id;
  end if;

  -- REQUEST_UPDATE au voyageur — déjà SECURITY DEFINER ici, insertion
  -- directe (pas besoin de passer par create_notification()/service_role).
  insert into public.notifications (user_id, type, priority, title, body, related_object_type, related_object_id)
  values (
    v_voyageur_id, 'request_update', 'normal',
    'Proposition acceptée',
    'Le client a accepté ta proposition — direction /jibli pour la suite.',
    'travel_request', v_request_id
  );

  perform set_config('jibli.bypass_transition_checks', 'false', true);
end;
$$;

grant execute on function public.accept_travel_proposal(uuid, public.payment_method, text, text) to authenticated;

-- Le client confirme avoir reçu l'objet : seule action qui libère les fonds
-- (le passage à 'completed' par le voyageur seul ne suffit pas). Atomique :
-- pose client_confirmed_at ET fait passer travel_payments à 'released'.
-- Pas de libération automatique après un délai si le client ne confirme
-- jamais — ce cas de litige est volontairement laissé à une phase admin
-- dédiée (résolution manuelle), comme demandé.
create or replace function public.confirm_travel_receipt(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_status public.travel_request_status;
  v_confirmed_at timestamptz;
  v_payment_status public.travel_payment_status;
begin
  select client_id, status, client_confirmed_at
    into v_client_id, v_status, v_confirmed_at
  from public.travel_requests
  where id = p_request_id
  for update;

  if v_client_id is null then
    raise exception 'Demande introuvable.';
  end if;
  if v_client_id <> auth.uid() then
    raise exception 'Seul le client propriétaire de la demande peut confirmer la réception.';
  end if;
  if v_status <> 'completed' then
    raise exception 'La demande doit être au statut "completed" pour confirmer la réception.';
  end if;
  if v_confirmed_at is not null then
    raise exception 'Réception déjà confirmée.';
  end if;
  -- Même garde-fou que travel_reviews_insert_involved (avis) et
  -- auto_release_stale_payments (plus bas) : un litige ouvert bloque toute
  -- libération de fonds, manuelle ou automatique, quel que soit le délai
  -- écoulé — trou fermé ici (cette fonction ne le vérifiait pas avant).
  if exists (select 1 from public.disputes where travel_request_id = p_request_id and status = 'open') then
    raise exception 'Un litige est ouvert sur cette mission — résolution requise avant libération des fonds.';
  end if;

  select status into v_payment_status from public.travel_payments where request_id = p_request_id for update;

  if v_payment_status is null then
    raise exception 'Aucun paiement associé à cette demande.';
  end if;
  if v_payment_status <> 'escrowed' then
    raise exception 'Le paiement doit être "escrowed" pour être libéré (statut actuel : %).', v_payment_status;
  end if;

  perform set_config('jibli.bypass_transition_checks', 'true', true);

  update public.travel_requests set client_confirmed_at = now() where id = p_request_id;
  update public.travel_payments
    set status = 'released', released_at = now(), release_reason = 'client_confirmed'
    where request_id = p_request_id;

  perform set_config('jibli.bypass_transition_checks', 'false', true);
end;
$$;

grant execute on function public.confirm_travel_receipt(uuid) to authenticated;

-- ============================================================================
-- Escrow : colonnes ajoutées, travel_payments, withdrawal_requests
-- ============================================================================
alter table public.travel_requests add column if not exists client_confirmed_at timestamptz;
-- Posée par enforce_travel_request_transitions() au moment exact de la
-- transition in_transit → completed (cf. plus haut) — référence temporelle
-- de auto_release_stale_payments(), plus bas.
alter table public.travel_requests add column if not exists completed_at timestamptz;
alter table public.travel_payments add column if not exists release_reason text check (release_reason in ('client_confirmed', 'auto_released_after_delay'));

-- Coordonnées Flouci de la plateforme, affichées au client au moment du
-- paiement (même table que les coordonnées bancaires : c'est la même idée
-- de "config paiement plateforme", pas besoin d'une table séparée pour un champ).
alter table public.bank_transfer_info add column if not exists flouci_phone text;

-- Un seul paiement par demande (une seule proposition est jamais acceptée).
-- payment_proof_url : virement uniquement. payment_ref : Flouci uniquement
-- (id de transaction retourné par l'API). 'refunded' n'est déclenché par
-- aucun code pour l'instant — réservé à la résolution de litige (phase admin
-- future), la colonne existe pour ne pas avoir à migrer plus tard.
create table if not exists public.travel_payments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.travel_requests(id) on delete cascade,
  payment_method public.payment_method not null check (payment_method in ('virement', 'flouci')),
  payment_proof_url text,
  payment_ref text,
  amount numeric(10,3) not null check (amount >= 0),
  commission_amount numeric(10,3) not null default 0 check (commission_amount >= 0),
  status public.travel_payment_status not null default 'awaiting_verification',
  verified_by uuid references public.profiles(id), -- admin ayant validé un virement ; null pour Flouci (vérifié par l'API)
  verified_at timestamptz,
  released_at timestamptz,
  -- Distingue une libération sur action du client ('client_confirmed', via
  -- confirm_travel_receipt), automatique après délai de silence
  -- ('auto_released_after_delay', via auto_release_stale_payments) ou sur
  -- décision admin lors d'un litige ('admin_dispute_resolution', via
  -- resolve_dispute_release_funds, plus bas) — nulle tant que status n'est
  -- pas 'released'. Ne JAMAIS faire dire à cette colonne autre chose que ce
  -- qui s'est réellement passé (même discipline que resolution_note sur
  -- disputes : pas de donnée maquillée).
  release_reason text check (release_reason in ('client_confirmed', 'auto_released_after_delay', 'admin_dispute_resolution')),
  -- Posée par resolve_dispute_refund() : ne documente jamais qu'un
  -- remboursement réel a été déclenché par le code (aucun mécanisme
  -- n'existe), seulement qu'un admin a enregistré l'avoir fait manuellement.
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_payments_status_idx on public.travel_payments(status);

drop trigger if exists trg_travel_payments_updated_at on public.travel_payments;
create trigger trg_travel_payments_updated_at
  before update on public.travel_payments
  for each row execute function public.set_updated_at();

do $$ begin
  create type public.withdrawal_status as enum ('pending', 'paid', 'rejected');
exception when duplicate_object then null; end $$;

-- Trace les demandes de retrait ; le traitement réel (virement au voyageur)
-- reste manuel côté admin pour l'instant, cette table ne fait que tracer la
-- demande et son statut.
create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  voyageur_id uuid not null references public.profiles(id),
  amount numeric(10,3) not null check (amount > 0),
  status public.withdrawal_status not null default 'pending',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.profiles(id)
);

create index if not exists withdrawal_requests_voyageur_idx on public.withdrawal_requests(voyageur_id);
create index if not exists withdrawal_requests_status_idx on public.withdrawal_requests(status);

-- Solde disponible d'un voyageur : somme nette (montant - commission) des
-- paiements released liés à ses propositions acceptées, moins les retraits
-- déjà pending/paid (un rejet libère à nouveau le montant). Utilisée pour
-- l'affichage ET pour valider qu'une nouvelle demande de retrait ne dépasse
-- pas le disponible (trigger juste en dessous).
create or replace function public.travel_voyageur_balance(p_voyageur_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_released numeric;
  v_reserved numeric;
begin
  select coalesce(sum(tpay.amount - tpay.commission_amount), 0) into v_released
  from public.travel_payments tpay
  join public.travel_requests tr on tr.id = tpay.request_id
  join public.travel_proposals prop on prop.id = tr.accepted_proposal_id
  where prop.voyageur_id = p_voyageur_id and tpay.status = 'released';

  select coalesce(sum(amount), 0) into v_reserved
  from public.withdrawal_requests
  where voyageur_id = p_voyageur_id and status in ('pending', 'paid');

  return v_released - v_reserved;
end;
$$;

grant execute on function public.travel_voyageur_balance(uuid) to authenticated;

create or replace function public.enforce_withdrawal_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount > public.travel_voyageur_balance(new.voyageur_id) then
    raise exception 'Montant demandé (%) supérieur au solde disponible.', new.amount;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_withdrawal_enforce_amount on public.withdrawal_requests;
create trigger trg_withdrawal_enforce_amount
  before insert on public.withdrawal_requests
  for each row execute function public.enforce_withdrawal_amount();

alter table public.travel_payments enable row level security;
alter table public.withdrawal_requests enable row level security;

drop policy if exists "travel_payments_select_involved" on public.travel_payments;
create policy "travel_payments_select_involved"
  on public.travel_payments for select
  using (
    public.owns_travel_request(request_id)
    or public.is_accepted_voyageur_for_request(request_id)
    or public.is_admin()
  );

-- Écriture réservée à l'admin : les deux RPC (accept_travel_proposal,
-- confirm_travel_receipt) contournent cette policy via SECURITY DEFINER,
-- aucun accès client direct n'est nécessaire pour leur fonctionnement.
drop policy if exists "travel_payments_write_admin_only" on public.travel_payments;
create policy "travel_payments_write_admin_only"
  on public.travel_payments for insert
  with check (public.is_admin());

drop policy if exists "travel_payments_update_admin_only" on public.travel_payments;
create policy "travel_payments_update_admin_only"
  on public.travel_payments for update
  using (public.is_admin());

drop policy if exists "withdrawal_requests_select_own_or_admin" on public.withdrawal_requests;
create policy "withdrawal_requests_select_own_or_admin"
  on public.withdrawal_requests for select
  using (voyageur_id = auth.uid() or public.is_admin());

drop policy if exists "withdrawal_requests_insert_own" on public.withdrawal_requests;
create policy "withdrawal_requests_insert_own"
  on public.withdrawal_requests for insert
  with check (voyageur_id = auth.uid() and public.is_client());

-- Pas d'UI admin pour traiter les retraits construite maintenant (traitement
-- manuel, phase ultérieure comme demandé) — la policy existe déjà pour que
-- ce soit sécurisé dès que cette UI sera construite.
drop policy if exists "withdrawal_requests_update_admin_only" on public.withdrawal_requests;
create policy "withdrawal_requests_update_admin_only"
  on public.withdrawal_requests for update
  using (public.is_admin());

-- ============================================================================
-- RLS : travel_requests / travel_proposals
-- ============================================================================
alter table public.travel_requests enable row level security;
alter table public.travel_proposals enable row level security;

-- travel_requests -------------------------------------------------------------
drop policy if exists "travel_requests_select_open_or_involved" on public.travel_requests;
create policy "travel_requests_select_open_or_involved"
  on public.travel_requests for select
  using (
    status = 'open'
    or client_id = auth.uid()
    or public.is_admin()
    -- un voyageur ayant proposé doit pouvoir revoir la demande même après
    -- qu'elle ait quitté 'open' (nécessaire pour /jibli/mes-propositions).
    -- Passe par une fonction SECURITY DEFINER (has_proposal_on_request, cf.
    -- plus haut) et non une sous-requête brute, pour éviter la récursion
    -- avec la policy SELECT de travel_proposals ci-dessous.
    or public.has_proposal_on_request(id)
  );

drop policy if exists "travel_requests_insert_client" on public.travel_requests;
create policy "travel_requests_insert_client"
  on public.travel_requests for insert
  with check ((client_id = auth.uid() and public.is_client()) or public.is_admin());

drop policy if exists "travel_requests_update_involved" on public.travel_requests;
create policy "travel_requests_update_involved"
  on public.travel_requests for update
  using (
    client_id = auth.uid()
    or public.is_admin()
    or public.is_accepted_voyageur_for_request(id)
  );
  -- Colonnes/transitions réellement permises : voir trigger
  -- enforce_travel_request_transitions ci-dessus.

-- travel_proposals --------------------------------------------------------
drop policy if exists "travel_proposals_select_involved" on public.travel_proposals;
create policy "travel_proposals_select_involved"
  on public.travel_proposals for select
  using (
    voyageur_id = auth.uid()
    or public.is_admin()
    -- Idem : owns_travel_request() (SECURITY DEFINER) plutôt qu'une
    -- sous-requête brute, pour la même raison anti-récursion.
    or public.owns_travel_request(request_id)
  );

drop policy if exists "travel_proposals_insert_client_not_own_request" on public.travel_proposals;
create policy "travel_proposals_insert_client_not_own_request"
  on public.travel_proposals for insert
  with check (
    voyageur_id = auth.uid()
    and public.is_client()
    and exists (
      select 1 from public.travel_requests tr
      where tr.id = travel_proposals.request_id
        and tr.status = 'open'
        and tr.client_id <> auth.uid() -- pas de proposition sur sa propre demande
    )
  );

drop policy if exists "travel_proposals_update_own" on public.travel_proposals;
create policy "travel_proposals_update_own"
  on public.travel_proposals for update
  using (voyageur_id = auth.uid() or public.is_admin());
  -- Seul le retrait (trigger enforce_travel_proposal_update) est permis en
  -- écriture directe ; l'acceptation passe exclusivement par la RPC.

-- Agrégat public (compteurs uniquement, aucun montant/identité individuel)
-- pour l'indicateur tendance 🔥/❄️ du carrousel home (TravelRequestCarousel)
-- — la policy select ci-dessus reste stricte, un visiteur anonyme ne peut
-- toujours pas lire une ligne travel_proposals individuelle.
create or replace function public.get_travel_request_engagement(p_request_ids uuid[])
returns table (request_id uuid, total_proposals bigint, recent_proposals bigint)
language sql
security definer
set search_path = public
stable
as $$
  select tp.request_id,
         count(*) as total_proposals,
         count(*) filter (where tp.created_at >= now() - interval '48 hours') as recent_proposals
  from public.travel_proposals tp
  where tp.request_id = any(p_request_ids)
  group by tp.request_id;
$$;

grant execute on function public.get_travel_request_engagement(uuid[]) to anon, authenticated;

-- travel_proposal_offers -------------------------------------------------
-- Lecture réservée aux deux parties du fil (comme travel_proposals) ;
-- aucune policy d'insert pour un rôle authentifié — toutes les écritures
-- passent par submit_counter_offer()/agree_to_current_offer()/le trigger
-- log_initial_negotiation_offer() (tous security definer, contournent RLS).
alter table public.travel_proposal_offers enable row level security;

drop policy if exists "travel_proposal_offers_select_involved" on public.travel_proposal_offers;
create policy "travel_proposal_offers_select_involved"
  on public.travel_proposal_offers for select
  using (
    exists (
      select 1 from public.travel_proposals tp
      where tp.id = travel_proposal_offers.proposal_id
        and (tp.voyageur_id = auth.uid() or public.owns_travel_request(tp.request_id) or public.is_admin())
    )
  );

-- profiles : autorise un client et un voyageur à se voir mutuellement dès
-- qu'ils sont en relation via une proposition (nécessaire pour afficher un
-- nom sur les propositions reçues, et coordonner la remise une fois matché).
-- Ne concerne que les deux parties d'une même transaction, pas tous les
-- utilisateurs de la plateforme.
drop policy if exists "profiles_select_travel_counterparties" on public.profiles;
create policy "profiles_select_travel_counterparties"
  on public.profiles for select
  using (
    exists (
      select 1 from public.travel_proposals tp
      join public.travel_requests tr on tr.id = tp.request_id
      where (tp.voyageur_id = profiles.id and tr.client_id = auth.uid())
         or (tr.client_id = profiles.id and tp.voyageur_id = auth.uid())
    )
  );

-- ============================================================================
-- Storage : bucket travel-request-photos (photos d'objets, annonces publiques)
-- ============================================================================
-- Public (contrairement à payment-proofs) : ce sont des photos d'annonces
-- affichées à tout utilisateur consultant une demande ouverte.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('travel-request-photos', 'travel-request-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "travel_photos_insert_own_folder" on storage.objects;
create policy "travel_photos_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'travel-request-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "travel_photos_select_public" on storage.objects;
create policy "travel_photos_select_public"
  on storage.objects for select
  using (bucket_id = 'travel-request-photos');

drop policy if exists "travel_photos_delete_own_folder" on storage.objects;
create policy "travel_photos_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'travel-request-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- Storage : bucket profile-photos (avatar + cover, publics)
-- ============================================================================
-- Public comme travel-request-photos : avatar/cover sont affichés à tout
-- visiteur consultant un profil. Un seul bucket pour les deux types de
-- photo, différenciés par le nom de fichier (ex: {user_id}/avatar.jpg,
-- {user_id}/cover.jpg) — le 1er segment du chemin reste l'user_id, donc les
-- policies "dossier perso" ci-dessous s'appliquent aux deux sans distinction.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "profile_photos_insert_own_folder" on storage.objects;
create policy "profile_photos_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile_photos_select_public" on storage.objects;
create policy "profile_photos_select_public"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

drop policy if exists "profile_photos_delete_own_folder" on storage.objects;
create policy "profile_photos_delete_own_folder"
  on storage.objects for delete
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Vue admin_client_stats supprimée avec `orders` (dont elle dépendait
-- entièrement — nombre de commandes par client). app/(admin)/admin/
-- utilisateurs/[id]/page.tsx, seul consommateur, à traiter en étape 3
-- (retrait de la section commandes de cette page).

-- ============================================================================
-- Table: wallet_adjustments
-- Ajustements manuels de wallet_balance par un admin, depuis
-- /admin/utilisateurs/[id] — table dédiée plutôt que de réutiliser
-- wallet_credits (dont `reason` est contraint par un check enum spécifique
-- au parrainage : referral_referrer/referral_referred/checkout_redemption,
-- cf. plus haut). Mélanger les deux aurait forcé soit à assouplir cette
-- contrainte (risque pour le système de parrainage), soit à mentir sur la
-- raison — une table séparée est plus propre.
-- ============================================================================
create table if not exists public.wallet_adjustments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  amount numeric(10,3) not null check (amount <> 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists wallet_adjustments_profile_idx on public.wallet_adjustments(profile_id);

alter table public.wallet_adjustments enable row level security;

drop policy if exists "wallet_adjustments_select_own_or_admin" on public.wallet_adjustments;
create policy "wallet_adjustments_select_own_or_admin"
  on public.wallet_adjustments for select
  using (profile_id = auth.uid() or public.is_admin());

-- Pas de policy INSERT côté client : passe exclusivement par
-- adjust_wallet_balance() (SECURITY DEFINER, vérifie is_admin() elle-même)
-- pour que l'écriture dans wallet_adjustments et la mise à jour de
-- wallet_balance restent atomiques (même transaction).

-- Ajuste wallet_balance ET trace l'ajustement dans wallet_adjustments en une
-- seule transaction (SECURITY DEFINER = tout ou rien). is_admin() vérifiée
-- explicitement ici (ne pas se reposer uniquement sur grant execute, qui
-- n'empêche pas un compte client authentifié d'appeler la fonction).
create or replace function public.adjust_wallet_balance(
  p_profile_id uuid,
  p_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Seul un administrateur peut ajuster un solde.';
  end if;
  if p_amount = 0 then
    raise exception 'Le montant de l''ajustement ne peut pas être nul.';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Une raison est requise pour un ajustement de solde.';
  end if;

  update public.profiles set wallet_balance = wallet_balance + p_amount where id = p_profile_id;

  insert into public.wallet_adjustments (profile_id, amount, reason, created_by)
  values (p_profile_id, p_amount, p_reason, auth.uid());
end;
$$;

grant execute on function public.adjust_wallet_balance(uuid, numeric, text) to authenticated;

-- ============================================================================
-- Table: identity_verifications
-- Vérification d'identité (KYC) client — v1 simple : Storage + une table,
-- pas de prestataire tiers. Une ligne par profil (profile_id unique) : une
-- resoumission ÉCRASE la précédente plutôt que d'empiler un historique —
-- suffisant pour v1, pas de besoin de conserver les tentatives rejetées.
-- ============================================================================
create type public.identity_verification_status as enum ('pending', 'approved', 'rejected');

create table public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id),
  id_document_url text not null,
  selfie_url text not null,
  status public.identity_verification_status not null default 'pending',
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index identity_verifications_status_idx on public.identity_verifications(status);

drop trigger if exists trg_identity_verifications_updated_at on public.identity_verifications;
create trigger trg_identity_verifications_updated_at
  before update on public.identity_verifications
  for each row execute function public.set_updated_at();

alter table public.identity_verifications enable row level security;

-- Pas de policy insert/update pour un compte client : toute soumission ou
-- resoumission passe exclusivement par submit_identity_verification()
-- ci-dessous (SECURITY DEFINER) — impossible pour un client de s'auto-
-- approuver en écrivant `status` directement via une policy update trop
-- permissive.
drop policy if exists "identity_verifications_select_own_or_admin" on public.identity_verifications;
create policy "identity_verifications_select_own_or_admin"
  on public.identity_verifications for select
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "identity_verifications_update_admin_only" on public.identity_verifications;
create policy "identity_verifications_update_admin_only"
  on public.identity_verifications for update
  using (public.is_admin());

-- Expose un simple booléen ("Voyageur vérifié" sur ProposalCard) sans
-- donner accès à la ligne identity_verifications elle-même (documents,
-- raison de refus...) — la policy select ci-dessus reste stricte
-- (profile_id = auth.uid() or admin), ce RPC est la seule fuite volontaire
-- et minimale vers les autres utilisateurs.
create or replace function public.is_identity_verified(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.identity_verifications
    where profile_id = p_profile_id and status = 'approved'
  );
end;
$$;

grant execute on function public.is_identity_verified(uuid) to authenticated;

-- Upsert la vérification du compte appelant : toujours remise à 'pending',
-- champs de revue vidés (une resoumission après rejet doit repasser par un
-- examen complet, pas garder l'ancien statut/raison affichés par erreur).
create or replace function public.submit_identity_verification(
  p_id_document_url text,
  p_selfie_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_client() then
    raise exception 'Seul un compte client peut soumettre une vérification d''identité.';
  end if;

  insert into public.identity_verifications (profile_id, id_document_url, selfie_url, status)
  values (auth.uid(), p_id_document_url, p_selfie_url, 'pending')
  on conflict (profile_id) do update set
    id_document_url = excluded.id_document_url,
    selfie_url = excluded.selfie_url,
    status = 'pending',
    rejection_reason = null,
    reviewed_by = null,
    reviewed_at = null;
end;
$$;

grant execute on function public.submit_identity_verification(text, text) to authenticated;

-- ============================================================================
-- Storage : bucket identity-documents (CIN + selfie pour le KYC)
-- ============================================================================
-- Privé, comme payment-proofs. Même convention de chemin ({user_id}/...) et
-- mêmes policies insert/select — un compte ne voit que son propre dossier,
-- un admin voit tout (pour la revue depuis /admin/verifications).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('identity-documents', 'identity-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "identity_documents_insert_own_folder" on storage.objects;
create policy "identity_documents_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- upsert:true (resoumission) nécessite aussi une policy update, contraire-
-- ment à payment-proofs qui n'en a pas eue besoin jusqu'ici — ajoutée ici
-- explicitement pour éviter la même ambiguïté.
drop policy if exists "identity_documents_update_own_folder" on storage.objects;
create policy "identity_documents_update_own_folder"
  on storage.objects for update
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "identity_documents_select_own_or_admin" on storage.objects;
create policy "identity_documents_select_own_or_admin"
  on storage.objects for select
  using (
    bucket_id = 'identity-documents'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- ============================================================================
-- Table: disputes
-- Litiges sur une mission Jibli — n'existait pas avant (les seules traces
-- du concept étaient deux commentaires "réservé à une phase admin future",
-- cf. confirm_travel_receipt() et travel_payments.status='refunded').
-- Scopé aux missions crowd-shipping. "status" à 2 valeurs suffit pour les
-- 3 filtres de /profil/litiges (Tous = pas de filtre, Ouverts, Résolus). Résolution
-- (passage à 'resolved') réservée à l'admin, pas de policy update client.
-- ============================================================================
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  travel_request_id uuid not null references public.travel_requests(id) on delete cascade,
  opened_by uuid not null references public.profiles(id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  -- Quelle décision financière a été prise à la résolution — distinct de
  -- resolution_note (texte libre) : permet de filtrer/afficher sans parser
  -- le texte. Posé exclusivement par les 3 fonctions resolve_dispute_*
  -- ci-dessous, jamais par écriture directe.
  resolution_type text check (resolution_type in ('released_to_voyageur', 'refunded_to_client', 'closed_no_action')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Table déjà existante en prod (créée sans resolution_type à l'origine) :
-- ADD COLUMN nécessaire pour que la ligne ci-dessus atteigne la vraie table.
alter table public.disputes add column if not exists resolution_type text
  check (resolution_type in ('released_to_voyageur', 'refunded_to_client', 'closed_no_action'));

create index if not exists disputes_travel_request_idx on public.disputes(travel_request_id);
create index if not exists disputes_opened_by_idx on public.disputes(opened_by);
-- Un seul litige OUVERT à la fois par personne et par mission — évite les
-- doublons accidentels (double-clic, re-soumission) sans empêcher un
-- second litige une fois le premier résolu.
create unique index if not exists disputes_one_open_per_opener
  on public.disputes(travel_request_id, opened_by)
  where status = 'open';

drop trigger if exists trg_disputes_updated_at on public.disputes;
create trigger trg_disputes_updated_at
  before update on public.disputes
  for each row execute function public.set_updated_at();

alter table public.disputes enable row level security;

-- Réutilise owns_travel_request()/is_accepted_voyageur_for_request(),
-- déjà écrites pour les policies travel_proposals — même définition de
-- "partie de la transaction", pas de nouvelle logique à auditer.
drop policy if exists "disputes_select_involved" on public.disputes;
create policy "disputes_select_involved"
  on public.disputes for select
  using (
    opened_by = auth.uid()
    or public.owns_travel_request(travel_request_id)
    or public.is_accepted_voyageur_for_request(travel_request_id)
    or public.is_admin()
  );

drop policy if exists "disputes_insert_involved" on public.disputes;
create policy "disputes_insert_involved"
  on public.disputes for insert
  with check (
    opened_by = auth.uid()
    and (public.owns_travel_request(travel_request_id) or public.is_accepted_voyageur_for_request(travel_request_id))
  );

drop policy if exists "disputes_update_admin_only" on public.disputes;
create policy "disputes_update_admin_only"
  on public.disputes for update
  using (public.is_admin());

-- ============================================================================
-- Résolution admin des litiges — 3 issues financières possibles
-- ============================================================================
-- Même squelette que confirm_travel_receipt() (SECURITY DEFINER, verrouillage
-- FOR UPDATE, vérifications explicites avant écriture). Différence
-- importante : confirm_travel_receipt()/accept_travel_proposal() sont des
-- actions CLIENT (vérifiées via auth.uid() = client_id) — ici ce sont des
-- actions ADMIN. SECURITY DEFINER contourne RLS, donc is_admin() DOIT être
-- vérifié explicitement en tout début de chaque fonction : aucune policy ne
-- protège un appel RPC de la même façon qu'un .update() direct passant par
-- disputes_update_admin_only.
--
-- Aucune des 3 ne touche travel_requests (ni status ni client_confirmed_at) :
-- client_confirmed_at documente exclusivement une confirmation réelle du
-- client (le remplir depuis une décision admin fausserait tout ce qui s'en
-- sert plus tard, ex: avis/trust score) et le statut opérationnel de la
-- mission est orthogonal à l'issue financière d'un litige. disputes.resolved_at
-- (déjà existant) + resolution_type (ci-dessus) suffisent à documenter la
-- résolution — aucune nouvelle colonne sur travel_requests.
--
-- Note obligatoire sur les 3 (pas seulement refund/close) : cohérent avec
-- l'exigence UI "note obligatoire avant résolution", et resolution_note
-- sert à documenter la décision quelle que soit l'issue, pas seulement les
-- cas sans action automatique.
alter table public.travel_payments add column if not exists refunded_at timestamptz;

-- resolve_dispute_release_funds() a besoin d'une 3e valeur pour
-- release_reason (déjà contraint à 'client_confirmed'/'auto_released_after_delay'
-- depuis le chantier libération automatique) — recrée la contrainte avec la
-- valeur ajoutée plutôt que d'en poser une nouvelle en parallèle.
alter table public.travel_payments drop constraint if exists travel_payments_release_reason_check;
alter table public.travel_payments add constraint travel_payments_release_reason_check
  check (release_reason in ('client_confirmed', 'auto_released_after_delay', 'admin_dispute_resolution'));

-- Action financière RÉELLE et complète : passe travel_payments.status à
-- 'released', exactement ce que fait déjà confirm_travel_receipt() —
-- déblocage comptable interne (travel_voyageur_balance() somme sur ce
-- statut, indifférent à la raison), aucun appel externe banque/Flouci
-- nécessaire. Précondition status='escrowed' identique à
-- confirm_travel_receipt() : un paiement déjà released/refunded/pas encore
-- vérifié ne peut pas être "libéré" une seconde fois par ce chemin.
create or replace function public.resolve_dispute_release_funds(p_dispute_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute_status text;
  v_request_id uuid;
  v_payment_status public.travel_payment_status;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé — réservé aux administrateurs.';
  end if;
  if p_note is null or length(trim(p_note)) < 5 then
    raise exception 'Une note de résolution est requise (5 caractères minimum).';
  end if;

  select status, travel_request_id into v_dispute_status, v_request_id
  from public.disputes
  where id = p_dispute_id
  for update;

  if v_request_id is null then
    raise exception 'Litige introuvable.';
  end if;
  if v_dispute_status <> 'open' then
    raise exception 'Ce litige est déjà résolu.';
  end if;

  select status into v_payment_status
  from public.travel_payments
  where request_id = v_request_id
  for update;

  if v_payment_status is null then
    raise exception 'Aucun paiement associé à cette mission.';
  end if;
  if v_payment_status <> 'escrowed' then
    raise exception 'Le paiement doit être "escrowed" pour être libéré (statut actuel : %).', v_payment_status;
  end if;

  update public.travel_payments
    set status = 'released', released_at = now(), release_reason = 'admin_dispute_resolution'
    where request_id = v_request_id;

  update public.disputes
    set status = 'resolved',
        resolution_type = 'released_to_voyageur',
        resolution_note = trim(p_note),
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = p_dispute_id;
end;
$$;

grant execute on function public.resolve_dispute_release_funds(uuid, text) to authenticated;

-- NE DÉCLENCHE AUCUN REMBOURSEMENT RÉEL : aucun mécanisme de remboursement
-- n'existe dans ce projet (pas d'API Flouci de remboursement, jamais testée
-- de toute façon — cf. lib/flouci.ts ; un virement retour est par nature une
-- action manuelle hors système). Cette fonction documente uniquement qu'un
-- remboursement a déjà été effectué manuellement par l'admin EN DEHORS de
-- Livrily — le texte du bouton côté UI doit le dire explicitement
-- ("Marquer comme remboursé manuellement", jamais juste "Rembourser").
create or replace function public.resolve_dispute_refund(p_dispute_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute_status text;
  v_request_id uuid;
  v_payment_status public.travel_payment_status;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé — réservé aux administrateurs.';
  end if;
  if p_note is null or length(trim(p_note)) < 5 then
    raise exception 'Une note de résolution est requise (5 caractères minimum) — documente comment le remboursement a été effectué manuellement.';
  end if;

  select status, travel_request_id into v_dispute_status, v_request_id
  from public.disputes
  where id = p_dispute_id
  for update;

  if v_request_id is null then
    raise exception 'Litige introuvable.';
  end if;
  if v_dispute_status <> 'open' then
    raise exception 'Ce litige est déjà résolu.';
  end if;

  select status into v_payment_status
  from public.travel_payments
  where request_id = v_request_id
  for update;

  if v_payment_status is null then
    raise exception 'Aucun paiement associé à cette mission.';
  end if;
  if v_payment_status <> 'escrowed' then
    raise exception 'Le paiement doit être "escrowed" pour être marqué remboursé (statut actuel : %).', v_payment_status;
  end if;

  update public.travel_payments
    set status = 'refunded', refunded_at = now()
    where request_id = v_request_id;

  update public.disputes
    set status = 'resolved',
        resolution_type = 'refunded_to_client',
        resolution_note = trim(p_note),
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = p_dispute_id;
end;
$$;

grant execute on function public.resolve_dispute_refund(uuid, text) to authenticated;

-- Litige non fondé (ou déjà réglé hors de ces 2 chemins) : aucune action
-- financière, juste la décision et l'audit trail.
create or replace function public.resolve_dispute_close(p_dispute_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispute_status text;
begin
  if not public.is_admin() then
    raise exception 'Accès refusé — réservé aux administrateurs.';
  end if;
  if p_note is null or length(trim(p_note)) < 5 then
    raise exception 'Une note de résolution est requise (5 caractères minimum).';
  end if;

  select status into v_dispute_status
  from public.disputes
  where id = p_dispute_id
  for update;

  if v_dispute_status is null then
    raise exception 'Litige introuvable.';
  end if;
  if v_dispute_status <> 'open' then
    raise exception 'Ce litige est déjà résolu.';
  end if;

  update public.disputes
    set status = 'resolved',
        resolution_type = 'closed_no_action',
        resolution_note = trim(p_note),
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = p_dispute_id;
end;
$$;

grant execute on function public.resolve_dispute_close(uuid, text) to authenticated;

-- ============================================================================
-- Appareils connectés : lecture + révocation des sessions actives
-- ============================================================================
-- auth.sessions n'est PAS exposée via PostgREST sur ce projet (confirmé en
-- direct : erreur PGRST106, "Only the following schemas are exposed:
-- public, graphql_public"). Ces 2 fonctions SECURITY DEFINER contournent
-- cette restriction depuis L'INTÉRIEUR de Postgres (où elle ne s'applique
-- pas), tout en ne renvoyant/n'affectant JAMAIS que les sessions de
-- l'appelant — jamais d'accès direct au schéma auth depuis le client.
create or replace function public.list_my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  user_agent text,
  ip text
)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.created_at, s.updated_at, s.user_agent, s.ip::text
  from auth.sessions s
  where s.user_id = auth.uid();
$$;

grant execute on function public.list_my_sessions() to authenticated;

-- Révoque (supprime) une session appartenant à l'utilisateur courant.
-- Vérification explicite de propriété AVANT suppression — sécurité
-- critique, jamais de révocation cross-user. "is distinct from" plutôt que
-- "<>" : NULL <> NULL vaut NULL (donc "faux" dans un IF plpgsql), ce qui
-- laisserait passer une révocation si auth.uid() était NULL (connexion non
-- authentifiée) — "is distinct from" traite NULL comme une vraie valeur
-- comparable et bloque correctement ce cas. Vérifié en direct (compte de
-- test à 2 sessions + compte tiers) : isolation cross-user OK, révocation
-- légitime OK, refresh token de la session révoquée bien invalidé côté
-- Supabase Auth.
create or replace function public.revoke_my_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from auth.sessions where id = p_session_id;

  if v_owner is null then
    raise exception 'Session introuvable.';
  end if;

  if v_owner is distinct from auth.uid() then
    raise exception 'Non autorisé.';
  end if;

  delete from auth.sessions where id = p_session_id;
end;
$$;

grant execute on function public.revoke_my_session(uuid) to authenticated;

-- ============================================================================
-- Table: flouci_payment_incidents
-- Capture les cas où un paiement Flouci a réellement réussi (vérifié
-- serveur-à-serveur, jamais fait confiance aux paramètres d'URL) mais où
-- accept_travel_proposal() a ensuite échoué — rien n'était enregistré nulle
-- part jusqu'ici pour ces cas (juste une redirection ?flouci=orphaned,
-- perdue au refresh). Écrite uniquement par le client admin (service role,
-- dans le callback) — jamais accessible en écriture aux utilisateurs
-- normaux, pas de policy INSERT pour authenticated. Exécutée en prod et
-- vérifiée en direct avant ce commit.
-- ============================================================================
create table if not exists public.flouci_payment_incidents (
  id uuid primary key default gen_random_uuid(),
  travel_request_id uuid not null references public.travel_requests(id) on delete cascade,
  travel_proposal_id uuid not null references public.travel_proposals(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  flouci_payment_id text not null unique,
  amount numeric(10,3) not null check (amount >= 0),
  error_message text not null,
  status text not null default 'unresolved' check (status in ('unresolved', 'resolved')),
  resolution_note text,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists flouci_incidents_status_idx on public.flouci_payment_incidents(status);
create index if not exists flouci_incidents_client_idx on public.flouci_payment_incidents(client_id);

alter table public.flouci_payment_incidents enable row level security;

drop policy if exists "flouci_incidents_select_admin_only" on public.flouci_payment_incidents;
create policy "flouci_incidents_select_admin_only"
  on public.flouci_payment_incidents for select
  using (public.is_admin());

drop policy if exists "flouci_incidents_update_admin_only" on public.flouci_payment_incidents;
create policy "flouci_incidents_update_admin_only"
  on public.flouci_payment_incidents for update
  using (public.is_admin());

-- ============================================================================
-- Table: travel_reviews
-- ============================================================================
-- Avis mutuel client<->voyageur, un par mission complétée (grain =
-- travel_request_id, comme disputes/travel_payments) et par auteur (unique
-- ci-dessous) : reviewer_id est toujours soit le client, soit le voyageur
-- accepté de CETTE demande, donc au plus 2 lignes par mission.
--
-- Double aveugle : un avis n'est visible par LA PERSONNE NOTÉE que quand
-- l'autre avis de la même mission existe déjà, ou que 14 jours se sont
-- écoulés (cf. is_review_revealed ci-dessous) — évite qu'une note influence
-- la note en retour (représailles). L'auteur voit toujours son propre avis
-- (nécessaire pour pouvoir le corriger dans les 48h, cf. policy update).
--
-- hidden_by_admin/hidden_reason/hidden_by/hidden_at : modération sans jamais
-- supprimer (même logique que resolution_note sur disputes) — champs prêts,
-- aucune UI admin construite dans cette passe (dette volontaire assumée).
create table if not exists public.travel_reviews (
  id uuid primary key default gen_random_uuid(),
  travel_request_id uuid not null references public.travel_requests(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  reviewee_id uuid not null references public.profiles(id),
  direction text not null check (direction in ('client_to_voyageur', 'voyageur_to_client')),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  hidden_by_admin boolean not null default false,
  hidden_reason text,
  hidden_by uuid references public.profiles(id),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (travel_request_id, reviewer_id)
);

create index if not exists travel_reviews_reviewee_idx on public.travel_reviews(reviewee_id);
create index if not exists travel_reviews_request_idx on public.travel_reviews(travel_request_id);

drop trigger if exists trg_travel_reviews_updated_at on public.travel_reviews;
create trigger trg_travel_reviews_updated_at
  before update on public.travel_reviews
  for each row execute function public.set_updated_at();

-- Révélation à LA PERSONNE NOTÉE (pas à l'auteur, qui voit toujours son
-- propre avis) : soit l'autre avis de la mission existe, soit 14 jours sont
-- passés depuis la soumission de CET avis. SECURITY DEFINER : la policy
-- SELECT de travel_reviews a besoin de cette vérification, qui interroge
-- travel_reviews elle-même — même pattern que owns_travel_request()/
-- is_accepted_voyageur_for_request() plus haut, pour éviter toute ambiguïté
-- d'évaluation récursive de policy en gardant la requête interne hors RLS.
create or replace function public.is_review_revealed(p_review_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_request_id uuid;
  v_reviewer_id uuid;
  v_created_at timestamptz;
begin
  select travel_request_id, reviewer_id, created_at
    into v_request_id, v_reviewer_id, v_created_at
  from public.travel_reviews
  where id = p_review_id;

  if v_request_id is null then
    return false;
  end if;

  return
    now() - v_created_at > interval '14 days'
    or exists (
      select 1 from public.travel_reviews
      where travel_request_id = v_request_id and reviewer_id <> v_reviewer_id
    );
end;
$$;

alter table public.travel_reviews enable row level security;

drop policy if exists "travel_reviews_select_involved" on public.travel_reviews;
create policy "travel_reviews_select_involved"
  on public.travel_reviews for select
  using (
    reviewer_id = auth.uid()
    or (reviewee_id = auth.uid() and public.is_review_revealed(id))
    or public.is_admin()
  );

-- Mutuel, gaté sur client_confirmed_at (pas juste status='completed' : seul
-- confirm_travel_receipt() prouve que la transaction est vraiment allée au
-- bout, cf. commentaire sur cette fonction plus haut) et bloqué si un litige
-- est encore ouvert sur la mission (évite qu'un avis serve d'arme pendant
-- un conflit actif — reste possible une fois le litige résolu).
drop policy if exists "travel_reviews_insert_involved" on public.travel_reviews;
create policy "travel_reviews_insert_involved"
  on public.travel_reviews for insert
  with check (
    reviewer_id = auth.uid()
    and (public.owns_travel_request(travel_request_id) or public.is_accepted_voyageur_for_request(travel_request_id))
    and exists (
      select 1 from public.travel_requests
      where id = travel_request_id and client_confirmed_at is not null
    )
    and not exists (
      select 1 from public.disputes
      where travel_request_id = travel_reviews.travel_request_id and status = 'open'
    )
  );

-- Fenêtre de correction de 48h après soumission, puis figé (aucune policy
-- ne couvre au-delà) — corrige une erreur de frappe/étoile sans permettre
-- un revirement tardif une fois l'avis potentiellement déjà révélé à l'autre.
drop policy if exists "travel_reviews_update_own_recent" on public.travel_reviews;
create policy "travel_reviews_update_own_recent"
  on public.travel_reviews for update
  using (reviewer_id = auth.uid() and created_at > now() - interval '48 hours');

drop policy if exists "travel_reviews_update_admin_moderation" on public.travel_reviews;
create policy "travel_reviews_update_admin_moderation"
  on public.travel_reviews for update
  using (public.is_admin());

-- Moyenne PUBLIQUE (avg_rating + review_count seulement, jamais le contenu
-- d'un avis ni qui l'a écrit) : nécessaire pour évaluer la confiance d'un
-- inconnu (ex: un voyageur qui hésite à proposer sur la demande d'un client
-- qu'il n'a jamais croisé) — la policy SELECT ci-dessus, elle, reste
-- contreparties-only pour le contenu individuel. SECURITY DEFINER pour lire
-- au-delà de cette policy, mais ne renvoie que l'agrégat. Respecte le
-- double aveugle (exclut les avis pas encore révélés) et la modération
-- (exclut hidden_by_admin) — jamais recalculée/stockée : ce projet calcule
-- ce type d'agrégat à la lecture plutôt que par trigger dès que le volume
-- reste faible (cf. commentaires ailleurs dans ce fichier), et un trigger
-- ne pourrait de toute façon pas suivre la révélation par simple écoulement
-- du temps (aucun événement d'écriture ne se produit au bout de 14 jours).
create or replace function public.get_profile_rating(p_profile_id uuid)
returns table (avg_rating numeric, review_count int)
language sql
security definer
set search_path = public
stable
as $$
  select
    round(avg(rating), 1) as avg_rating,
    count(*)::int as review_count
  from public.travel_reviews
  where reviewee_id = p_profile_id
    and hidden_by_admin = false
    and (
      now() - created_at > interval '14 days'
      or exists (
        select 1 from public.travel_reviews other
        where other.travel_request_id = travel_reviews.travel_request_id
          and other.reviewer_id <> travel_reviews.reviewer_id
      )
    );
$$;

-- Revoke explicite de anon en plus du grant à authenticated — trou de
-- sécurité préexistant trouvé en testant en direct le Trust System (Phase
-- 3, brique 3/N, plus bas dans ce fichier) : sans ce revoke, le piège des
-- privilèges par défaut de ce projet (alter default privileges accorde
-- EXECUTE à anon directement à la création, indépendamment de PUBLIC)
-- laissait n'importe quel appelant anonyme lire la note moyenne de
-- n'importe quel profil. Corrigé indépendamment de ce chantier, dès
-- confirmation.
revoke execute on function public.get_profile_rating(uuid) from public;
revoke execute on function public.get_profile_rating(uuid) from anon;
grant execute on function public.get_profile_rating(uuid) to authenticated;

-- ============================================================================
-- Libération automatique des fonds après délai de silence du client
-- ============================================================================
-- Si le client ne confirme jamais réception (silence, pas de litige non
-- plus), le voyageur restait bloqué indéfiniment — aucun recours. Cette
-- fonction reproduit exactement les effets de confirm_travel_receipt()
-- (mêmes 2 updates, même garde bypass_transition_checks) pour un lot de
-- missions éligibles, appelée par pg_cron une fois par jour (cf. plus bas).
--
-- Éligibilité : status='completed' (le voyageur a déclaré la livraison),
-- client_confirmed_at encore null (le client n'a jamais confirmé),
-- completed_at posé depuis au moins platform_settings.auto_release_delay_days
-- jours, ET aucun litige 'open' sur la mission — ce dernier point est un
-- blocage absolu, quel que soit le délai écoulé, jamais contournable.
--
-- Pas de grant execute à authenticated : cette fonction n'est appelable que
-- par pg_cron (contexte système, hors PostgREST) — même posture que
-- is_admin()/owns_travel_request(), jamais exposée en RPC cliente.
create or replace function public.auto_release_stale_payments()
returns table (released_request_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delay_days integer;
  v_request record;
begin
  select auto_release_delay_days into v_delay_days from public.platform_settings where id = true;

  perform set_config('jibli.bypass_transition_checks', 'true', true);

  for v_request in
    select tr.id
    from public.travel_requests tr
    join public.travel_payments tp on tp.request_id = tr.id
    where tr.status = 'completed'
      and tr.client_confirmed_at is null
      and tr.completed_at is not null
      and tr.completed_at <= now() - (coalesce(v_delay_days, 7) || ' days')::interval
      and tp.status = 'escrowed'
      and not exists (
        select 1 from public.disputes d
        where d.travel_request_id = tr.id and d.status = 'open'
      )
    for update of tr, tp
  loop
    update public.travel_requests set client_confirmed_at = now() where id = v_request.id;
    update public.travel_payments
      set status = 'released', released_at = now(), release_reason = 'auto_released_after_delay'
      where request_id = v_request.id and status = 'escrowed';

    released_request_id := v_request.id;
    return next;
  end loop;

  perform set_config('jibli.bypass_transition_checks', 'false', true);
end;
$$;

-- pg_cron plutôt que Vercel Cron : toute la logique métier de ce projet vit
-- déjà en Postgres (SECURITY DEFINER, triggers d'invariants) — cohérent
-- avec cette architecture, et surtout aucun secret à configurer côté
-- dashboard Vercel (classe de risque déjà rencontrée avec
-- NEXT_PUBLIC_SITE_URL manquant en prod). Fonctionne même si le
-- déploiement Next.js a un problème.
--
-- Disponibilité de l'extension non garantie selon le plan Supabase —
-- postgis l'est déjà (tête de ce fichier), bon signe mais pas une
-- certitude pour pg_cron. Si cette ligne échoue, basculer sur Vercel Cron
-- (route API appelant auto_release_stale_payments() via le client
-- service_role) — la fonction ci-dessus reste inchangée dans les deux cas.
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'auto-release-stale-payments') then
    perform cron.schedule(
      'auto-release-stale-payments',
      '0 3 * * *', -- tous les jours à 3h (heure du serveur, généralement UTC)
      $cron$select public.auto_release_stale_payments();$cron$
    );
  end if;
end $$;

-- ============================================================================
-- Table: notifications
-- Centre de notifications générique (Phase 3, brique 1/N — Trust System,
-- Trips, Matching viendront après). Branché uniquement sur des événements
-- qui existent déjà : TRANSACTION_UPDATE (paiement virement vérifié,
-- verifyTravelPayment), REQUEST_UPDATE (statut d'une demande qui change),
-- REVIEW_AVAILABLE (avis révélé — cas mutuel seulement ; le cas 14 jours
-- n'a aucun événement d'écriture, cf. is_review_revealed() plus haut,
-- sous-chantier séparé si voulu), VERIFICATION_UPDATE (KYC approuvé/rejeté).
--
-- Décision explicite : ne notifie PAS la résolution de litige
-- (resolve_dispute_release_funds/refund/close) — décision antérieure
-- intacte, pas rouverte par ce chantier.
--
-- In-app uniquement pour cette phase (aucun déclenchement OneSignal :
-- sendPushToUser() n'est appelée nulle part dans le code actuel, jamais
-- testée en prod). Pas de table notification_deliveries pour l'instant —
-- rien à y mettre tant qu'aucun canal n'envoie réellement ; le design
-- polymorphe (related_object_type/id) permet d'en ajouter une plus tard
-- sans aucune migration sur cette table.
-- ============================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- text+check plutôt qu'un vrai enum Postgres : cet ensemble va grossir à
  -- chaque futur chantier de la direction Phase 3 (Trust System, Trips,
  -- Matching ajoutent chacun leurs propres types) — même raisonnement que
  -- disputes.resolution_type (ensemble textuel qui évolue), pas
  -- travel_payment_status (ensemble stable, vrai enum).
  type text not null check (type in (
    'transaction_update', 'request_update', 'review_available', 'verification_update'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  -- Texte généré à l'écriture (pas de JSON structuré + template au rendu) :
  -- plus simple, et reste historiquement exact même si l'objet lié change
  -- après coup.
  title text not null,
  body text,
  -- Lien "ouvrir l'objet lié" — polymorphe (peut pointer vers
  -- travel_requests, travel_payments, identity_verifications...), donc pas
  -- de vraie FK ; résolu côté UI au clic (href construit selon
  -- related_object_type).
  related_object_type text check (related_object_type in ('travel_request', 'travel_payment', 'identity_verification')),
  related_object_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
  -- Pas d'updated_at/trigger set_updated_at : une notification n'a qu'UNE
  -- seule mutation possible dans sa vie (read_at), qui porte déjà son
  -- propre horodatage.
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Pas de policy INSERT — même principe que flouci_payment_incidents
-- (aucune policy INSERT du tout, vérifié) : écriture réservée à
-- create_notification() ci-dessous (appelée exclusivement via le client
-- service_role) et aux RPC qui insèrent directement dans leur propre
-- transaction (accept_travel_proposal ci-dessus, déjà SECURITY DEFINER).

-- Point d'entrée centralisé pour créer une notification "pour un autre
-- utilisateur" (ex: le client notifie le voyageur) depuis les Server
-- Actions qui ne sont pas déjà des RPC SECURITY DEFINER (verifyTravelPayment,
-- advanceRequestStatus, cancelRequest, submitReview, approveVerification,
-- rejectVerification). SECURITY DEFINER pour contourner l'absence de
-- policy INSERT ci-dessus — mais AUCUN grant à `authenticated` (à la
-- différence des autres RPC de ce fichier, appelées via la session de
-- l'utilisateur lui-même) : un utilisateur authentifié qui pourrait
-- l'appeler directement créerait des notifications arbitraires pour
-- n'importe qui (spam/hameçonnage). Appelée exclusivement via le client
-- service_role (createAdminClient()) depuis les Server Actions concernées
-- — même modèle de confiance que le callback webhook Flouci, qui utilise
-- déjà le client service_role pour écrire dans flouci_payment_incidents
-- (aucune policy INSERT là non plus). Ce projet Supabase accorde EXECUTE à
-- anon/authenticated/service_role PAR DÉFAUT à la création d'une fonction
-- (alter default privileges configuré au niveau du projet) — un simple
-- `revoke ... from public` ne suffit PAS à retirer ce grant DIRECT sur
-- authenticated (vérifié en direct : un utilisateur authentifié normal a pu
-- appeler cette fonction malgré ce revoke, avant le correctif ci-dessous).
-- Revoke explicite des rôles concrets (public, authenticated, anon), pas
-- seulement de PUBLIC.
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_priority text default 'normal',
  p_related_object_type text default null,
  p_related_object_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (user_id, type, priority, title, body, related_object_type, related_object_id)
  values (p_user_id, p_type, p_priority, p_title, p_body, p_related_object_type, p_related_object_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- CORRECTIF : `revoke ... from public` seul ne suffit PAS sur ce projet
-- Supabase — vérifié en direct (un utilisateur authentifié normal a réussi
-- à appeler create_notification() et à insérer une notification forgée
-- malgré ce revoke). Cause : Supabase configure par défaut
-- `alter default privileges in schema public grant execute on functions to
-- anon, authenticated, service_role`, donc `authenticated` reçoit un grant
-- DIRECT à la création de la fonction, indépendant du pseudo-rôle PUBLIC —
-- révoquer PUBLIC ne touche pas ce grant séparé. Revoke explicite des deux
-- rôles concrets ci-dessous, qui fonctionne quel que soit le mécanisme de
-- grant par défaut.
revoke execute on function public.create_notification(uuid, text, text, text, text, text, uuid) from public;
revoke execute on function public.create_notification(uuid, text, text, text, text, text, uuid) from authenticated;
revoke execute on function public.create_notification(uuid, text, text, text, text, text, uuid) from anon;

-- ============================================================================
-- Table: trips (Phase 3, brique 2/N — Trips)
-- Un voyageur publie une disponibilité À L'AVANCE (route + date + poids
-- disponible), avant qu'aucune demande spécifique n'existe — première fois
-- dans ce projet qu'un voyageur agit de façon PROACTIVE plutôt que
-- réactive (répondre à une travel_requests existante). Décisions
-- tranchées : un trip = une seule mise en relation à la fois pour la v1
-- (pas de gestion de capacité partagée — matched_proposal_id ci-dessous en
-- est la seule trace) ; le matching est une recommandation, jamais une
-- mise en relation automatique (aucune écriture de ce chantier ne crée de
-- travel_proposals toute seule) ; indicative_price est un point de départ
-- qui alimente le même fil de négociation existant, jamais un tarif fixe.
-- ============================================================================
do $$ begin
  create type public.trip_status as enum ('open', 'matched', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  voyageur_id uuid not null references public.profiles(id),
  origin_country text not null,
  destination_city text not null,
  travel_date date not null,
  -- NOT NULL contrairement à travel_requests.item_weight_kg (ajouté plus
  -- bas, nullable) : un trip existe précisément pour annoncer une capacité,
  -- pas de sens sans elle. item_weight_kg côté demande reste optionnel car
  -- rétrofitté sur un flux existant qui ne le demandait pas jusqu'ici.
  available_weight_kg numeric(6,2) not null check (available_weight_kg > 0),
  -- Indication de départ, jamais un tarif verrouillé — alimente le même
  -- fil de négociation existant (travel_proposal_offers) une fois une
  -- mise en relation créée, cf. travel_proposals.source_trip_id plus bas.
  indicative_price numeric(10,3) check (indicative_price >= 0),
  pickup_city text,
  message text,
  status public.trip_status not null default 'open',
  -- Posé uniquement par accept_travel_proposal() quand la proposition
  -- acceptée a source_trip_id = ce trip — la seule trace de "mise en
  -- relation" pour la v1 (pas de table de capacité partagée).
  matched_proposal_id uuid references public.travel_proposals(id),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_status_idx on public.trips(status);
create index if not exists trips_voyageur_idx on public.trips(voyageur_id);
create index if not exists trips_route_idx on public.trips(origin_country, destination_city);

drop trigger if exists trg_trips_updated_at on public.trips;
create trigger trg_trips_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- Pas de trigger de transition de statut (contrairement à
-- trg_travel_requests_transitions) : la seule transition automatique
-- (open -> matched) est posée par accept_travel_proposal(), déjà
-- SECURITY DEFINER ; matched -> completed/cancelled n'a pas encore de
-- règle métier définie pour la v1, pas de machine à états à deviner
-- maintenant.

-- Lien optionnel vers le trip d'origine d'une proposition — permet à
-- accept_travel_proposal() de savoir quel trip faire passer à 'matched'.
-- Nullable : une proposition créée normalement (voyageur parcourant une
-- demande directement, sans passer par un trip) laisse ce champ vide,
-- comportement inchangé.
alter table public.travel_proposals add column if not exists source_trip_id uuid references public.trips(id);

-- Optionnel : n'affecte que le calcul de score des RPC de matching
-- ci-dessous, aucun flux existant (création de demande, négociation,
-- acceptation) n'en dépend.
alter table public.travel_requests add column if not exists item_weight_kg numeric(6,2) check (item_weight_kg is null or item_weight_kg > 0);

alter table public.trips enable row level security;

-- Historique : un premier correctif (is_client_of_matched_trip(), trouvé
-- en testant en direct) avait élargi la visibilité SELECT au client dont
-- la proposition acceptée venait de faire passer CE trip précis à
-- 'matched' — sans quoi il avait un 404 juste après acceptation. Remplacé
-- ici par une visibilité publique totale (/jibli/trips doit maintenant
-- garder un trip visible avec son statut à jour, pas le faire disparaître,
-- même demande que pour product_offers plus bas) : aucune colonne
-- sensible dans cette table (voyageur_id est juste un uuid, pas de PII —
-- le nom du voyageur reste dans profiles, séparément protégé), donc rien
-- à perdre à l'ouvrir. is_client_of_matched_trip() devient inutile
-- (aucune autre policy/fonction ne la référence, vérifié) — supprimée
-- plutôt que laissée comme code mort trompeur (son commentaire décrirait
-- un trou qui n'existe plus). DROP POLICY avant DROP FUNCTION : la policy
-- existante référence encore la fonction, la supprimer dans l'autre ordre
-- échoue ("cannot drop function ... because other objects depend on it").
drop policy if exists "trips_select_open_or_involved" on public.trips;
drop function if exists public.is_client_of_matched_trip(uuid);

create policy "trips_select_open_or_involved"
  on public.trips for select
  using (true);

drop policy if exists "trips_insert_own" on public.trips;
create policy "trips_insert_own"
  on public.trips for insert
  with check (voyageur_id = auth.uid() and public.is_client());

drop policy if exists "trips_update_own_or_admin" on public.trips;
create policy "trips_update_own_or_admin"
  on public.trips for update
  using (voyageur_id = auth.uid() or public.is_admin());

-- returns table modifié (ajout logistics_score/trust_category) : Postgres
-- refuse un changement de type de retour via create or replace, DROP
-- explicite requis. Sûr : aucune autre fonction/vue/policy de ce fichier
-- ne référence ces deux noms (vérifié par recherche exhaustive avant ce
-- changement).
drop function if exists public.get_trip_matches_for_request(uuid);
drop function if exists public.get_request_matches_for_trip(uuid);

-- Score de matching — RECOMMANDATION SEULEMENT, aucune écriture. Calculé à
-- la lecture (même philosophie que get_profile_rating : pas d'agrégat
-- stocké tant que le volume reste faible). Route obligatoire (filtrée
-- côté where, pas de fuzzy matching v1) ; date et poids sont des bonus,
-- absents si l'une des deux valeurs manque (item_weight_kg optionnel côté
-- demande).
--
-- Trust Score (Phase 3, brique 3/N, extension) : bonus dérivé de la
-- CATÉGORIE (jamais le score brut, même principe que TrustPanel/
-- ProposalCard) du voyageur propriétaire du trip. Jamais négatif — un
-- historique limité n'est jamais pénalisé, juste pas boosté (même
-- discipline "non punitive" que get_trust_score() lui-même).
--
-- score (avec bonus trust) pilote UNIQUEMENT le tri (order by) ;
-- logistics_score (date + poids seuls, sans trust) est la colonne que les
-- cartes (TripMatchCard/RequestMatchCard) utilisent pour le badge "Très
-- bonne correspondance" — sans cette séparation, un trip avec un timing
-- correct mais un poids insuffisant/non renseigné pourrait franchir le
-- seuil d'affichage grâce au seul bonus trust, ce qui viderait ce badge de
-- son sens ("ça correspond à ta demande" devenant partiellement "ce
-- voyageur est réputé").
--
-- CTE candidates avec limit 200 (par récence) AVANT le calcul des bonus :
-- filet de sécurité quasi gratuit contre un volume extrême de trips
-- ouverts sur une route exacte (le calcul du trust score, plus coûteux que
-- date/poids, se ferait sinon sur tout le jeu de candidats avant le tri
-- final) — sans effet au volume actuel, juste une borne pour plus tard.
create or replace function public.get_trip_matches_for_request(p_request_id uuid)
returns table (
  trip_id uuid,
  voyageur_id uuid,
  origin_country text,
  destination_city text,
  travel_date date,
  available_weight_kg numeric,
  indicative_price numeric,
  score int,
  logistics_score int,
  trust_category text
)
language sql
set search_path = public
stable
as $$
  with req as (
    select * from public.travel_requests where id = p_request_id
  ),
  candidates as (
    select t.*
    from public.trips t, req
    where t.status = 'open'
      and t.origin_country = req.origin_country
      and t.destination_city = req.destination_city
    order by t.created_at desc
    limit 200
  ),
  scored as (
    select
      c.*,
      case
        when req.needed_by is null then 0
        when abs(c.travel_date - req.needed_by) <= 3 then 30
        when abs(c.travel_date - req.needed_by) <= 7 then 15
        else 0
      end as date_bonus,
      case
        when req.item_weight_kg is null then 0
        when c.available_weight_kg >= req.item_weight_kg then 20
        else 0
      end as weight_bonus
    from candidates c, req
  )
  select
    s.id,
    s.voyageur_id,
    s.origin_country,
    s.destination_city,
    s.travel_date,
    s.available_weight_kg,
    s.indicative_price,
    (
      50 + s.date_bonus + s.weight_bonus +
      case coalesce(gts.category, 'limited_history')
        when 'excellent' then 15
        when 'high_trust' then 10
        when 'new_member' then 5
        else 0
      end
    )::int as score,
    (50 + s.date_bonus + s.weight_bonus)::int as logistics_score,
    coalesce(gts.category, 'limited_history') as trust_category
  from scored s
  left join lateral public.get_trust_score(s.voyageur_id) gts on true
  order by score desc, s.created_at desc
  limit 20;
$$;

grant execute on function public.get_trip_matches_for_request(uuid) to authenticated;

-- Symétrique côté voyageur (ses trips -> demandes qui pourraient
-- convenir) — même formule de score, dupliquée plutôt que factorisée en
-- une seule fonction générique : les deux sens ont des colonnes de retour
-- différentes (contexte demande vs contexte trip), une fonction générique
-- aurait nécessité un type de retour composite plus complexe pour un gain
-- de lisibilité négatif à ce stade. Bonus trust ici sur le CLIENT
-- (tr.client_id) — symétrique du sens ci-dessus, même raisonnement
-- (score/logistics_score/trust_category, cap 200 candidats).
create or replace function public.get_request_matches_for_trip(p_trip_id uuid)
returns table (
  request_id uuid,
  client_id uuid,
  item_description text,
  origin_country text,
  destination_city text,
  needed_by date,
  budget_max numeric,
  item_weight_kg numeric,
  score int,
  logistics_score int,
  trust_category text
)
language sql
set search_path = public
stable
as $$
  with trip as (
    select * from public.trips where id = p_trip_id
  ),
  candidates as (
    select tr.*
    from public.travel_requests tr, trip
    where tr.status = 'open'
      and tr.origin_country = trip.origin_country
      and tr.destination_city = trip.destination_city
    order by tr.created_at desc
    limit 200
  ),
  scored as (
    select
      c.*,
      case
        when c.needed_by is null then 0
        when abs(trip.travel_date - c.needed_by) <= 3 then 30
        when abs(trip.travel_date - c.needed_by) <= 7 then 15
        else 0
      end as date_bonus,
      case
        when c.item_weight_kg is null then 0
        when trip.available_weight_kg >= c.item_weight_kg then 20
        else 0
      end as weight_bonus
    from candidates c, trip
  )
  select
    s.id,
    s.client_id,
    s.item_description,
    s.origin_country,
    s.destination_city,
    s.needed_by,
    s.budget_max,
    s.item_weight_kg,
    (
      50 + s.date_bonus + s.weight_bonus +
      case coalesce(gts.category, 'limited_history')
        when 'excellent' then 15
        when 'high_trust' then 10
        when 'new_member' then 5
        else 0
      end
    )::int as score,
    (50 + s.date_bonus + s.weight_bonus)::int as logistics_score,
    coalesce(gts.category, 'limited_history') as trust_category
  from scored s
  left join lateral public.get_trust_score(s.client_id) gts on true
  order by score desc, s.created_at desc
  limit 20;
$$;

grant execute on function public.get_request_matches_for_trip(uuid) to authenticated;

-- Nouveau type de notification pour ce chantier — colonne conçue pour
-- grossir (cf. commentaire sur notifications.type). Distinct de
-- request_update : sémantiquement différent (une opportunité détectée,
-- pas un changement d'état d'une demande existante). Déclenché plus tard
-- par l'action "Signaler mon intérêt" côté client (pas construite dans ce
-- lot SQL — ne modifie aucune Server Action existante).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('transaction_update', 'request_update', 'review_available', 'verification_update', 'request_matched'));

-- ============================================================================
-- Trust System (Phase 3, brique 3/N)
-- Score composite calculé À LA LECTURE (même philosophie que
-- get_profile_rating : pas d'agrégat stocké tant que le volume reste
-- faible — chaque signal individuel est déjà bon marché, pas de jointure
-- lourde). get_profile_rating() reste inchangée, c'est UN signal parmi
-- d'autres ici, jamais remplacée.
--
-- Équité annulation/complétion (cf. document d'origine, "ne pas compter
-- les transactions annulées par l'autre partie de manière injuste") :
-- seul le CLIENT peut annuler une demande (cancelRequest, aucune action
-- équivalente côté voyageur, vérifié dans le code) — donc TOUTE demande
-- 'cancelled' est structurellement imputable au client, jamais au
-- voyageur. Conséquence assumée : aucun "taux de complétion voyageur"
-- n'est calculé (il serait trivialement toujours ~100%, donc sans
-- signal réel avec les données actuelles) — seul le VOLUME de missions
-- complétées comme voyageur compte, le taux de complétion/annulation
-- n'est calculé que côté client, où il est réellement significatif.
--
-- Pas de "Phone Verified" : aucune donnée source, canal SMS
-- (lib/twilio.ts) documenté comme non fiabilisé pour un usage de
-- sécurité — décision explicite de ne pas construire ce badge ici.
-- ============================================================================
do $$ begin
  create type public.trust_signals as (
    identity_verified boolean,
    avg_rating numeric,
    review_count int,
    accepted_as_client int,
    completed_as_client int,
    cancelled_as_client int,
    completed_as_voyageur int,
    disputes_count int,
    account_age_months int,
    has_released_payment boolean
  );
exception when duplicate_object then null; end $$;

-- Fonction interne, appelée uniquement par get_trust_score()/
-- get_trust_badges() ci-dessous (mêmes privilèges SECURITY DEFINER, appel
-- direct fonction-à-fonction) — pas de grant à authenticated, ne doit pas
-- devenir un point d'accès RPC public séparé qui exposerait la forme
-- interne des signaux bruts.
create or replace function public.compute_trust_signals(p_profile_id uuid)
returns public.trust_signals
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v public.trust_signals;
begin
  select exists(
    select 1 from public.identity_verifications
    where profile_id = p_profile_id and status = 'approved'
  ) into v.identity_verified;

  -- Réutilise get_profile_rating() telle quelle — ne duplique jamais la
  -- logique double-aveugle de révélation des avis.
  select gpr.avg_rating, gpr.review_count into v.avg_rating, v.review_count
  from public.get_profile_rating(p_profile_id) gpr;

  select
    count(*) filter (where accepted_proposal_id is not null),
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled')
  into v.accepted_as_client, v.completed_as_client, v.cancelled_as_client
  from public.travel_requests
  where client_id = p_profile_id;

  select count(*)
  into v.completed_as_voyageur
  from public.travel_proposals tp
  join public.travel_requests tr on tr.id = tp.request_id
  where tp.voyageur_id = p_profile_id
    and tp.status = 'accepted'
    and tr.status = 'completed';

  -- Même dérivation opener/client/voyageur accepté que
  -- /admin/litiges/[id]/page.tsx, réutilisée telle quelle.
  select count(distinct d.id)
  into v.disputes_count
  from public.disputes d
  join public.travel_requests tr on tr.id = d.travel_request_id
  left join public.travel_proposals tp on tp.id = tr.accepted_proposal_id
  where d.opened_by = p_profile_id
     or tr.client_id = p_profile_id
     or tp.voyageur_id = p_profile_id;

  select (
    extract(year from age(now(), created_at)) * 12
    + extract(month from age(now(), created_at))
  )::int
  into v.account_age_months
  from public.profiles
  where id = p_profile_id;

  select exists (
    select 1
    from public.travel_payments tpay
    join public.travel_requests tr on tr.id = tpay.request_id
    left join public.travel_proposals tp on tp.id = tr.accepted_proposal_id
    where tpay.status in ('escrowed', 'released')
      and (tr.client_id = p_profile_id or tp.voyageur_id = p_profile_id)
  ) into v.has_released_payment;

  return v;
end;
$$;

revoke execute on function public.compute_trust_signals(uuid) from public;
revoke execute on function public.compute_trust_signals(uuid) from authenticated;
revoke execute on function public.compute_trust_signals(uuid) from anon;

-- Poids de départ, non calibrés sur du volume réel — même réserve que
-- GOOD_PRICE_THRESHOLD_TND/SOON_WINDOW_DAYS ailleurs dans ce projet, à
-- ajuster une fois qu'il y a des données réelles. Chaque contribution est
-- explicitement neutralisée à 0 si le signal est absent (coalesce
-- systématique) : un profil neuf sans aucun avis/transaction doit
-- contribuer exactement 0 partout, jamais une erreur ni une valeur
-- fausse — en particulier (avg_rating - 3) * 5 vaudrait NULL pour un
-- profil sans aucun avis (avg_rating NULL), ce qui annulerait TOUT le
-- score sans le coalesce ci-dessous, pas juste le signal avis.
create or replace function public.get_trust_score(p_profile_id uuid)
returns table (score int, category text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v public.trust_signals;
  v_score numeric;
begin
  v := public.compute_trust_signals(p_profile_id);

  v_score := 50
    + (case when v.identity_verified then 15 else 0 end)
    + coalesce((v.avg_rating - 3) * 5, 0)
    + least((coalesce(v.completed_as_client, 0) + coalesce(v.completed_as_voyageur, 0)) * 2, 15)
    + (case
         when coalesce(v.accepted_as_client, 0) >= 3 and v.completed_as_client::numeric / v.accepted_as_client >= 0.9 then 10
         when coalesce(v.accepted_as_client, 0) >= 3 and v.completed_as_client::numeric / v.accepted_as_client < 0.7 then -15
         else 0
       end)
    + (case
         when coalesce(v.accepted_as_client, 0) >= 3 and v.cancelled_as_client::numeric / v.accepted_as_client > 0.3 then -10
         else 0
       end)
    - least(coalesce(v.disputes_count, 0) * 8, 20)
    + least(floor(coalesce(v.account_age_months, 0)::numeric / 3) * 2, 5);

  -- Plancher 0, plafond 99 — jamais 100/100 automatique. Règle dure, pas
  -- une tendance statistique.
  score := greatest(0, least(99, round(v_score)::int));

  category := case
    when score >= 90 then 'excellent'
    when score >= 70 then 'high_trust'
    when score >= 50 then 'new_member'
    else 'limited_history'
  end;

  return next;
end;
$$;

-- Revoke explicite de anon en plus du grant à authenticated : le piège des
-- privilèges par défaut de ce projet (alter default privileges accorde
-- EXECUTE à anon/authenticated directement à la création, indépendamment de
-- PUBLIC) donnerait sinon un accès anonyme silencieux — confirmé en testant
-- en direct pendant ce chantier (et, au passage, le même trou existe sur
-- get_profile_rating, préexistant, hors scope ici, signalé séparément).
revoke execute on function public.get_trust_score(uuid) from public;
revoke execute on function public.get_trust_score(uuid) from anon;
grant execute on function public.get_trust_score(uuid) to authenticated;

-- Badges dérivés — seuls ceux avec une vraie donnée source aujourd'hui.
-- Pas de "Phone Verified" (cf. commentaire de tête de section). Recalcule
-- compute_trust_signals() + get_trust_score() en interne (léger doublon
-- de calcul assumé plutôt qu'une factorisation plus complexe, pas
-- justifié au volume actuel).
create or replace function public.get_trust_badges(p_profile_id uuid)
returns table (badge text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v public.trust_signals;
  v_score int;
begin
  v := public.compute_trust_signals(p_profile_id);
  select gts.score into v_score from public.get_trust_score(p_profile_id) gts;

  if v.identity_verified then
    badge := 'identity_verified';
    return next;
  end if;

  if v.has_released_payment then
    badge := 'payment_verified';
    return next;
  end if;

  if v_score >= 80 and coalesce(v.completed_as_voyageur, 0) >= 1 then
    badge := 'trusted_traveler';
    return next;
  end if;

  if v_score >= 90 and coalesce(v.completed_as_voyageur, 0) >= 5 then
    badge := 'top_traveler';
    return next;
  end if;

  if coalesce(v.accepted_as_client, 0) >= 3 and v.completed_as_client::numeric / v.accepted_as_client >= 0.95 then
    badge := 'reliable_sender';
    return next;
  end if;

  return;
end;
$$;

-- Même revoke explicite de anon que get_trust_score() ci-dessus, même
-- raison.
revoke execute on function public.get_trust_badges(uuid) from public;
revoke execute on function public.get_trust_badges(uuid) from anon;
grant execute on function public.get_trust_badges(uuid) to authenticated;

-- ============================================================================
-- Table: product_offers (Phase 3, brique 4/N — "Offres")
-- Troisième parcours voyageur, autonome : le voyageur annonce un PRODUIT
-- PRÉCIS à un prix déjà fixé (ex: "iPhone 16, 1500 DT, Paris → Tunis,
-- disponible le 20/09"), AVANT qu'un client n'ait exprimé de demande —
-- distinct de trips (disponibilité générique, sans produit ni prix) et de
-- la négociation classique (le client publie la demande en premier).
--
-- item_price + delivery_fee séparés (pas un seul champ "prix") : mirror
-- exact de travel_proposals, pour que accept_travel_proposal() calcule la
-- commission sur delivery_fee sans aucune nouvelle logique — le voyageur
-- remplit les deux mêmes champs qu'il remplirait pour une proposition
-- classique (cf. ProposalAmounts.tsx : item_price remboursé au voyageur,
-- delivery_fee seul montant commissionnable).
-- ============================================================================
do $$ begin
  create type public.product_offer_status as enum ('open', 'matched', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.product_offers (
  id uuid primary key default gen_random_uuid(),
  voyageur_id uuid not null references public.profiles(id),
  item_description text not null,
  item_photo_url text, -- même bucket que travel_requests (travel-request-photos), même usage
  origin_country text not null,
  destination_city text not null,
  travel_date date not null, -- date de disponibilité du produit
  item_price numeric(10,3) not null check (item_price >= 0),
  delivery_fee numeric(10,3) not null check (delivery_fee >= 0),
  status public.product_offer_status not null default 'open',
  -- Posé uniquement par take_product_offer() ci-dessous — seule trace de
  -- "cette offre a été prise", même principe que trips.matched_proposal_id.
  matched_proposal_id uuid references public.travel_proposals(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_offers_status_idx on public.product_offers(status);
create index if not exists product_offers_voyageur_idx on public.product_offers(voyageur_id);
create index if not exists product_offers_route_idx on public.product_offers(origin_country, destination_city);

drop trigger if exists trg_product_offers_updated_at on public.product_offers;
create trigger trg_product_offers_updated_at
  before update on public.product_offers
  for each row execute function public.set_updated_at();

-- Lien optionnel vers l'offre d'origine d'une proposition — même rôle que
-- travel_proposals.source_trip_id (permet à accept_travel_proposal() de
-- savoir quelle logique appliquer), mais PAS le même moment de flip (cf.
-- take_product_offer() plus bas pour la justification : contrairement à
-- un trip, une offre représente une ressource UNIQUE — le flip doit
-- arriver à la prise, pas à l'acceptation, pour empêcher une double vente).
alter table public.travel_proposals add column if not exists source_offer_id uuid references public.product_offers(id);

alter table public.product_offers enable row level security;

-- Historique : is_client_of_matched_offer() avait été construite dès ce
-- chantier (anticipant le même trou déjà rencontré sur Trips) pour que le
-- client qui vient de prendre une offre puisse la revoir une fois
-- 'matched'. Remplacé par une visibilité publique totale : /jibli/offres
-- doit garder une offre visible avec son statut à jour ("Prise") au
-- lieu de la faire disparaître, pour n'importe quel visiteur, pas
-- seulement les parties impliquées — même changement que trips plus haut,
-- même raison (aucune colonne sensible : voyageur_id est un uuid, pas de
-- PII). is_client_of_matched_offer() devient inutile (aucune autre
-- policy/fonction ne la référence, vérifié) — supprimée plutôt que
-- laissée comme code mort trompeur. DROP POLICY avant DROP FUNCTION :
-- même raison que trips plus haut (dépendance policy -> fonction).
drop policy if exists "product_offers_select_open_or_involved" on public.product_offers;
drop function if exists public.is_client_of_matched_offer(uuid);

create policy "product_offers_select_open_or_involved"
  on public.product_offers for select
  using (true);

drop policy if exists "product_offers_insert_own" on public.product_offers;
create policy "product_offers_insert_own"
  on public.product_offers for insert
  with check (voyageur_id = auth.uid() and public.is_client());
  -- Vérification KYC (identity_verifications) faite côté Server Action,
  -- pas ici — même convention que trips_insert_own/travel_requests_insert_client,
  -- aucune des deux n'embarque ce contrôle en RLS non plus.

drop policy if exists "product_offers_update_own_or_admin" on public.product_offers;
create policy "product_offers_update_own_or_admin"
  on public.product_offers for update
  using (voyageur_id = auth.uid() or public.is_admin());
  -- Couvre l'annulation manuelle par le voyageur (page "Mes offres").
  -- take_product_offer() ci-dessous, SECURITY DEFINER, n'a pas besoin
  -- d'une policy pour flip le statut : elle s'exécute avec les privilèges
  -- du propriétaire de la fonction, hors RLS, même principe que
  -- accept_travel_proposal() écrivant déjà dans trips/travel_payments/
  -- notifications à travers des frontières de propriété.

-- Prise d'une offre par un client — SECURITY DEFINER car le client ne
-- PEUT PAS créer de travel_proposals lui-même (RLS : voyageur_id =
-- auth.uid() uniquement, cf. travel_proposals_insert_client_not_own_request)
-- ; contrairement à "Signaler mon intérêt" sur un trip (qui se contente de
-- notifier, laissant le VOYAGEUR créer la proposition), une offre doit
-- pouvoir être prise en un clic par le CLIENT — la RLS l'interdit
-- structurellement sans cette fonction.
--
-- Flip 'open' -> 'matched' ICI (à la prise), pas dans accept_travel_proposal()
-- comme pour les trips : une offre représente une ressource UNIQUE (un
-- seul iPhone précis), alors qu'un trip n'est qu'une capacité générique
-- réutilisable pour plusieurs négociations en parallèle jusqu'à
-- acceptation. Flip tardif (à l'acceptation) laisserait une fenêtre où
-- deux clients différents pourraient chacun prendre l'offre, créer leur
-- propre demande/proposition, et faire escrower des fonds séparément pour
-- le MÊME produit physique — une double vente, pas juste un
-- sur-engagement de capacité comme pour un trip. `for update` verrouille
-- la ligne le temps de la transaction : la 2e prise concurrente échoue
-- proprement (statut déjà 'matched') avant même de créer quoi que ce soit.
--
-- Compromis assumé pour la v1 : si le client abandonne le paiement entre
-- take_product_offer() et l'appel à accept_travel_proposal() qui suit
-- (même Server Action, mais 2 appels distincts), l'offre reste 'matched'
-- sans jamais être payée — récupération manuelle (admin) pour l'instant,
-- pas de nettoyage automatique. Risque jugé mineur : empêcher la double
-- vente prime sur ce cas plus rare et moins grave.
create or replace function public.take_product_offer(p_offer_id uuid)
returns table (request_id uuid, proposal_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Variables scalaires plutôt qu'un seul `record` : un `select ... into`
  -- sur un `record` qui ne trouve aucune ligne laisse la variable "non
  -- assignée" (record "v_offer" is not assigned yet dès qu'on référence
  -- un champ) au lieu de simplement mettre ses champs à NULL — piège
  -- plpgsql réel, évité ici en suivant le même motif que
  -- accept_travel_proposal() ci-dessus (variables scalaires + `if v_x is
  -- null then raise exception`).
  v_status public.product_offer_status;
  v_voyageur_id uuid;
  v_item_description text;
  v_item_photo_url text;
  v_origin_country text;
  v_destination_city text;
  v_travel_date date;
  v_item_price numeric(10,3);
  v_delivery_fee numeric(10,3);
  v_request_id uuid;
  v_proposal_id uuid;
begin
  select status, voyageur_id, item_description, item_photo_url, origin_country, destination_city, travel_date, item_price, delivery_fee
    into v_status, v_voyageur_id, v_item_description, v_item_photo_url, v_origin_country, v_destination_city, v_travel_date, v_item_price, v_delivery_fee
  from public.product_offers
  where id = p_offer_id
  for update;

  if v_voyageur_id is null then
    raise exception 'Offre introuvable.';
  end if;
  if v_status <> 'open' then
    raise exception 'Cette offre n''est plus disponible.';
  end if;
  if v_voyageur_id = auth.uid() then
    raise exception 'Impossible de prendre sa propre offre.';
  end if;

  insert into public.travel_requests (
    client_id, item_description, item_photo_url, origin_country, destination_city, budget_max, needed_by
  ) values (
    auth.uid(), v_item_description, v_item_photo_url, v_origin_country, v_destination_city,
    v_item_price + v_delivery_fee, v_travel_date
  ) returning id into v_request_id;

  insert into public.travel_proposals (
    request_id, voyageur_id, item_price, delivery_fee, travel_date, source_offer_id
  ) values (
    v_request_id, v_voyageur_id, v_item_price, v_delivery_fee, v_travel_date, p_offer_id
  ) returning id into v_proposal_id;

  update public.product_offers set status = 'matched', matched_proposal_id = v_proposal_id where id = p_offer_id;

  request_id := v_request_id;
  proposal_id := v_proposal_id;
  return next;
end;
$$;

grant execute on function public.take_product_offer(uuid) to authenticated;

-- ============================================================================
-- get_public_profile_summaries() — nom + avatar publics, pour les cartes
-- de listing (TripCard/ProductOfferCard/RequestCard). Champs volontairement
-- réduits au strict nécessaire (full_name, avatar_url) — jamais phone/
-- address/country/profession/email : profiles_select_own_or_admin/
-- profiles_select_travel_counterparties restent inchangées et continuent
-- de protéger la ligne complète (aucune des deux ne couvre "un visiteur
-- qui parcourt une liste publique, sans relation encore établie avec le
-- voyageur/client" — c'est précisément le trou que cette RPC comble, sans
-- élargir profiles lui-même). Même discipline que get_profile_rating()/
-- get_trust_score() : une RPC étroite plutôt qu'un accès table élargi.
--
-- Batchée (tableau d'ids, pas un id) : une page de listing affiche
-- plusieurs cartes, un appel unique évite N appels RPC séparés.
--
-- Grantée à anon en plus de authenticated : les 3 listings (trips,
-- product_offers, travel_requests 'open') sont déjà visibles par tous
-- (using(true)/status='open' public) — pas de raison de réserver juste le
-- nom/avatar aux connectés alors que le reste de la carte est déjà public.
create or replace function public.get_public_profile_summaries(p_profile_ids uuid[])
returns table (id uuid, full_name text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.full_name, p.avatar_url
  from public.profiles p
  where p.id = any(p_profile_ids);
$$;

grant execute on function public.get_public_profile_summaries(uuid[]) to authenticated;
grant execute on function public.get_public_profile_summaries(uuid[]) to anon;

-- ============================================================================
-- get_platform_member_count() — nombre total de comptes client, pour le
-- compteur "Membres Livrily" de la page d'accueil publique
-- (app/(client)/page.tsx). BUG trouvé et vérifié en direct : la query
-- d'origine (select count sur profiles, client RLS-bound normal) renvoie
-- toujours 0 pour un visiteur anonyme — profiles_select_own_or_admin
-- (id = auth.uid() or is_admin()) ne laisse jamais rien passer sans
-- session, alors que l'accueil est justement consultée sans connexion la
-- plupart du temps. Confirmé : 21 profils role='client' réels vus en
-- service_role, 0 vus par le même query exécutée en anon.
--
-- RPC étroite (un seul entier, aucune ligne individuelle de profiles
-- exposée) plutôt qu'un élargissement de profiles_select_own_or_admin —
-- même discipline que get_profile_rating()/get_trust_score()/
-- get_public_profile_summaries() plus haut. Pas createAdminClient() côté
-- TypeScript non plus : explicitement documenté (lib/supabase/server.ts)
-- comme réservé aux opérations administratives, pas à un compteur public.
create or replace function public.get_platform_member_count()
returns int
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from public.profiles where role = 'client';
$$;

grant execute on function public.get_platform_member_count() to authenticated;
grant execute on function public.get_platform_member_count() to anon;

-- ============================================================================
-- Boost payant (Phase 3, brique 5/N) — mise en avant temporaire d'un trip
-- ou d'une offre dans les listings, contre paiement. trips.boosted_until/
-- product_offers.boosted_until pilotent le tri (priorité au boost, pas un
-- remplacement du tri existant) et le badge visuel côté TypeScript ; cette
-- colonne n'est JAMAIS écrite directement par un client, même si RLS le
-- permettrait techniquement (trips_update_own_or_admin/
-- product_offers_update_own_or_admin n'ont qu'un USING, sans WITH CHECK
-- explicite — Postgres réutilise alors USING comme WITH CHECK, donc rien
-- n'empêcherait un client d'écrire boosted_until à la main sans jamais
-- payer). Seule purchase_boost_virement() ci-dessous (SECURITY DEFINER)
-- a le droit de la modifier — même discipline que matched_proposal_id sur
-- product_offers, jamais écrit directement malgré une policy UPDATE
-- permissive sur le reste de la ligne.
--
-- boost_payments : table séparée plutôt qu'une simple colonne, même
-- raisonnement que travel_payments vs travel_requests — de l'argent réel,
-- une trace d'audit indépendante, et la donnée nécessaire à un futur
-- reporting (revenu boost, durée moyenne achetée) qu'un simple
-- boosted_until écraserait à chaque nouvel achat. trip_id/product_offer_id
-- : mirror du pattern source_trip_id/source_offer_id (travel_proposals),
-- mais la contrainte d'exclusivité mutuelle est ici imposée en base (pas
-- juste documentée) — de l'argent réel, pas seulement un lien de
-- traçabilité.
--
-- Statuts volontairement plus simples que travel_payment_status : pas
-- d'escrow/libération ici, un boost est une prestation consommée
-- immédiatement, pas retenue puis "livrée" à une contrepartie.
do $$ begin
  create type public.boost_payment_status as enum ('awaiting_verification', 'paid');
exception when duplicate_object then null; end $$;

create table if not exists public.boost_payments (
  id uuid primary key default gen_random_uuid(),
  voyageur_id uuid not null references public.profiles(id),
  trip_id uuid references public.trips(id),
  product_offer_id uuid references public.product_offers(id),
  payment_method public.payment_method not null,
  payment_proof_url text,
  payment_ref text,
  amount numeric(10,3) not null check (amount >= 0),
  duration_days integer not null check (duration_days > 0),
  status public.boost_payment_status not null default 'awaiting_verification',
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint boost_payments_exactly_one_item check (
    ((trip_id is not null)::int + (product_offer_id is not null)::int) = 1
  )
);

create index if not exists boost_payments_trip_idx on public.boost_payments(trip_id);
create index if not exists boost_payments_offer_idx on public.boost_payments(product_offer_id);
create index if not exists boost_payments_voyageur_idx on public.boost_payments(voyageur_id);
create index if not exists boost_payments_status_idx on public.boost_payments(status);

drop trigger if exists trg_boost_payments_updated_at on public.boost_payments;
create trigger trg_boost_payments_updated_at
  before update on public.boost_payments
  for each row execute function public.set_updated_at();

alter table public.boost_payments enable row level security;

-- Lecture : le voyageur concerné ou un admin. Aucune policy INSERT pour
-- authenticated — même principe que wallet_credits/travel_proposal_offers :
-- la création passe exclusivement par purchase_boost_virement()
-- (SECURITY DEFINER), jamais en libre-service. UPDATE réservé à l'admin
-- (mirror exact de travel_payments_update_admin_only) : seul usage,
-- /admin/boost-paiements qui repasse awaiting_verification -> 'paid' —
-- un rapprochement comptable a posteriori, jamais un gate d'activation
-- (boosted_until est déjà posé depuis l'achat, cf. purchase_boost_virement
-- ci-dessous).
drop policy if exists "boost_payments_select_own_or_admin" on public.boost_payments;
create policy "boost_payments_select_own_or_admin"
  on public.boost_payments for select
  using (voyageur_id = auth.uid() or public.is_admin());

drop policy if exists "boost_payments_update_admin_only" on public.boost_payments;
create policy "boost_payments_update_admin_only"
  on public.boost_payments for update
  using (public.is_admin());

alter table public.trips add column if not exists boosted_until timestamptz;
alter table public.product_offers add column if not exists boosted_until timestamptz;

create index if not exists trips_boosted_until_idx on public.trips(boosted_until);
create index if not exists product_offers_boosted_until_idx on public.product_offers(boosted_until);

-- Achat d'un boost par virement — active boosted_until IMMÉDIATEMENT à
-- l'achat, même logique que le reste du système pour le virement (ex:
-- accept_travel_proposal : la mission passe à 'matched' tout de suite,
-- seul le paiement reste 'awaiting_verification' jusqu'à vérification
-- admin a posteriori) : le client n'attend jamais l'admin pour que son
-- achat prenne effet. La transition awaiting_verification -> 'paid' est
-- un rapprochement comptable a posteriori, jamais un gate d'activation.
--
-- Cumul : si l'item a déjà un boost actif, la nouvelle durée s'ajoute à la
-- fin du boost en cours plutôt que de repartir de maintenant (greatest())
-- — un ré-achat pendant un boost encore actif ne doit jamais "gaspiller"
-- du temps déjà payé.
--
-- RPC polymorphe (p_item_type) plutôt que deux RPC dupliquées par type :
-- contrairement à get_trip_matches_for_request/get_request_matches_for_trip
-- (colonnes de retour différentes, dupliquées à dessein), l'opération ici
-- est réellement identique à un nom de table près — un seul corps de
-- fonction, pas une duplication sans gain.
-- DROP FUNCTION d'abord : returns table modifié (boosted_until ->
-- new_boosted_until, cf. correctif ci-dessous), Postgres refuse un
-- changement de type de retour via create or replace. Aucune autre
-- fonction/policy ne référence purchase_boost_virement() (vérifié) — sûr.
drop function if exists public.purchase_boost_virement(text, uuid, text);

-- CORRECTIF trouvé en testant en direct (pas une régression, un vrai bug
-- de la première version) : la colonne de sortie s'appelait boosted_until,
-- exactement comme les colonnes trips.boosted_until/
-- product_offers.boosted_until référencées dans le corps de la fonction —
-- Postgres ne peut alors plus distinguer "le paramètre de sortie" de "la
-- colonne de table" dans les select/update qui suivent ("column reference
-- boosted_until is ambiguous", confirmé en exécutant). Renommée en
-- new_boosted_until pour lever toute ambiguïté.
create or replace function public.purchase_boost_virement(
  p_item_type text,
  p_item_id uuid,
  p_payment_proof_url text
)
returns table (payment_id uuid, new_boosted_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_voyageur_id uuid;
  v_status text;
  v_current_boosted_until timestamptz;
  v_price numeric(10,3);
  v_duration_days integer;
  v_new_boosted_until timestamptz;
  v_payment_id uuid;
begin
  if p_item_type not in ('trip', 'offer') then
    raise exception 'Type d''item invalide : %.', p_item_type;
  end if;
  if p_payment_proof_url is null then
    raise exception 'Preuve de virement manquante.';
  end if;

  if p_item_type = 'trip' then
    select voyageur_id, status, boosted_until
      into v_voyageur_id, v_status, v_current_boosted_until
    from public.trips
    where id = p_item_id
    for update;
  else
    select voyageur_id, status, boosted_until
      into v_voyageur_id, v_status, v_current_boosted_until
    from public.product_offers
    where id = p_item_id
    for update;
  end if;

  if v_voyageur_id is null then
    raise exception 'Introuvable.';
  end if;
  if v_voyageur_id <> auth.uid() then
    raise exception 'Seul le propriétaire peut booster cet item.';
  end if;
  if v_status <> 'open' then
    raise exception 'Seul un item disponible (''open'') peut être boosté.';
  end if;

  select boost_price_tnd, boost_duration_days into v_price, v_duration_days
  from public.platform_settings where id = true;

  v_new_boosted_until := greatest(coalesce(v_current_boosted_until, now()), now()) + (v_duration_days || ' days')::interval;

  insert into public.boost_payments (
    voyageur_id, trip_id, product_offer_id, payment_method, payment_proof_url, amount, duration_days
  ) values (
    auth.uid(),
    case when p_item_type = 'trip' then p_item_id else null end,
    case when p_item_type = 'offer' then p_item_id else null end,
    'virement', p_payment_proof_url, v_price, v_duration_days
  ) returning id into v_payment_id;

  if p_item_type = 'trip' then
    update public.trips set boosted_until = v_new_boosted_until where id = p_item_id;
  else
    update public.product_offers set boosted_until = v_new_boosted_until where id = p_item_id;
  end if;

  payment_id := v_payment_id;
  new_boosted_until := v_new_boosted_until;
  return next;
end;
$$;

revoke execute on function public.purchase_boost_virement(text, uuid, text) from public;
revoke execute on function public.purchase_boost_virement(text, uuid, text) from anon;
grant execute on function public.purchase_boost_virement(text, uuid, text) to authenticated;

-- SELECT sur platform_settings est admin-only (platform_settings_select_admin_only,
-- expose aussi travel_commission_rate, plus sensible) — un propriétaire de
-- trip/offre a besoin de connaître le prix/durée du boost pour afficher le
-- CTA (BoostPayment.tsx). RPC étroite plutôt que d'élargir cette policy,
-- même raisonnement que get_public_profile_summaries().
create or replace function public.get_boost_pricing()
returns table (boost_price_tnd numeric, boost_duration_days integer)
language sql
stable
security definer
set search_path = public
as $$
  select boost_price_tnd, boost_duration_days from public.platform_settings where id = true;
$$;

revoke execute on function public.get_boost_pricing() from public;
revoke execute on function public.get_boost_pricing() from anon;
grant execute on function public.get_boost_pricing() to authenticated;

-- ============================================================================
-- Boost payant — tarification par palier (Phase 3, brique 6/N)
-- ============================================================================
-- Remplace le palier fixe unique (platform_settings.boost_price_tnd/
-- boost_duration_days) par une grille 1-7 jours, chaque durée son propre
-- prix. ADDITIF UNIQUEMENT dans cette brique : boost_price_tnd/
-- boost_duration_days, get_boost_pricing() et purchase_boost_virement(text,
-- uuid, text) restent intacts et pleinement fonctionnels — le frontend
-- actuellement en prod (feat/boost-payant, déjà mergé) continue de tourner
-- sans interruption sur l'ancienne forme le temps que le nouveau
-- TypeScript (brique suivante) se déploie et bascule dessus. Une brique de
-- nettoyage ultérieure supprimera l'ancienne forme une fois confirmé que
-- plus rien ne l'appelle.
create table if not exists public.boost_pricing_tiers (
  duration_days integer primary key check (duration_days between 1 and 7),
  price_tnd numeric(10,3) not null check (price_tnd >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

drop trigger if exists trg_boost_pricing_tiers_updated_at on public.boost_pricing_tiers;
create trigger trg_boost_pricing_tiers_updated_at
  before update on public.boost_pricing_tiers
  for each row execute function public.set_updated_at();

alter table public.boost_pricing_tiers enable row level security;

-- Même discipline que platform_settings : lecture directe admin-only
-- (get_boost_pricing_tiers() ci-dessous est le seul chemin pour un client),
-- écriture admin-only (pas d'UI admin dans cette brique — ajoutable plus
-- tard sur ce même modèle, cf. /admin/parametres/commission — mais la
-- policy est posée dès maintenant pour ne pas avoir à y revenir).
drop policy if exists "boost_pricing_tiers_select_admin_only" on public.boost_pricing_tiers;
create policy "boost_pricing_tiers_select_admin_only"
  on public.boost_pricing_tiers for select
  using (public.is_admin());

drop policy if exists "boost_pricing_tiers_write_admin_only" on public.boost_pricing_tiers;
create policy "boost_pricing_tiers_write_admin_only"
  on public.boost_pricing_tiers for insert
  with check (public.is_admin());

drop policy if exists "boost_pricing_tiers_update_admin_only" on public.boost_pricing_tiers;
create policy "boost_pricing_tiers_update_admin_only"
  on public.boost_pricing_tiers for update
  using (public.is_admin());

-- Grille de départ (à ajuster plus tard via SQL direct ou une future UI
-- admin) — dégressive au jour, ancrée sur le point actuel (5 TND/3j).
-- on conflict do nothing : ré-exécution de ce script sans effet si déjà
-- seedé, jamais d'écrasement d'une grille déjà ajustée manuellement.
insert into public.boost_pricing_tiers (duration_days, price_tnd) values
  (1, 2.000),
  (2, 3.500),
  (3, 5.000),
  (4, 6.000),
  (5, 7.000),
  (6, 8.000),
  (7, 9.000)
on conflict (duration_days) do nothing;

-- Grille complète pour un client authentifié — cf. get_boost_pricing() plus
-- haut pour le même raisonnement (platform_settings/boost_pricing_tiers
-- admin-only en RLS).
create or replace function public.get_boost_pricing_tiers()
returns table (duration_days integer, price_tnd numeric)
language sql
stable
security definer
set search_path = public
as $$
  select duration_days, price_tnd from public.boost_pricing_tiers order by duration_days;
$$;

revoke execute on function public.get_boost_pricing_tiers() from public;
revoke execute on function public.get_boost_pricing_tiers() from anon;
grant execute on function public.get_boost_pricing_tiers() to authenticated;

-- Boost sur les demandes (travel_requests) — même discipline que
-- trips.boosted_until/product_offers.boosted_until : jamais écrit
-- directement par un client (travel_requests_update_involved n'a qu'un
-- USING, pas de WITH CHECK explicite — même gap latent que sur
-- trips/product_offers, déjà documenté là-bas), seule la RPC
-- purchase_boost_virement() ci-dessous la modifie. Uniquement pertinent
-- pour status='open' : 'matched' n'est plus listé nulle part
-- (app/(client)/jibli/page.tsx filtre sur 'open' uniquement, jamais
-- élargi contrairement à Trips/Offres) — booster une demande matched
-- n'aurait aucun effet visible, la RPC le refuse explicitement plus bas.
alter table public.travel_requests add column if not exists boosted_until timestamptz;
create index if not exists travel_requests_boosted_until_idx on public.travel_requests(boosted_until);

-- boost_payments : 3e origine possible (request_id), en plus de trip_id/
-- product_offer_id. La contrainte d'exclusivité mutuelle est étendue aux 3
-- colonnes plutôt que remplacée, même raisonnement qu'à sa création.
alter table public.boost_payments add column if not exists request_id uuid references public.travel_requests(id);
create index if not exists boost_payments_request_idx on public.boost_payments(request_id);

alter table public.boost_payments drop constraint if exists boost_payments_exactly_one_item;
alter table public.boost_payments add constraint boost_payments_exactly_one_item check (
  ((trip_id is not null)::int + (product_offer_id is not null)::int + (request_id is not null)::int) = 1
);

-- Notifications boost (chantier notifications+admin pricing) — nouveau type
-- unique 'boost_update' couvrant les 3 événements du domaine (virement
-- reçu, paiement vérifié, boost terminé), plutôt qu'un type par événement :
-- même raisonnement que request_update, qui couvre déjà plusieurs
-- sous-événements distincts d'un même domaine. Extension par
-- drop/add constraint, même pattern que l'ajout de request_matched
-- ci-dessus (pas de nouvelle colonne, la table grossit par construction).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('transaction_update', 'request_update', 'review_available', 'verification_update', 'request_matched', 'boost_update'));

-- related_object_type n'avait que travel_request/travel_payment/
-- identity_verification — le boost touche aussi trips et product_offers,
-- deux tables qui n'avaient encore jamais eu de notification pointant
-- vers elles. Noms alignés sur les tables (trip, product_offer), cohérent
-- avec travel_request déjà présent.
alter table public.notifications drop constraint if exists notifications_related_object_type_check;
alter table public.notifications add constraint notifications_related_object_type_check
  check (related_object_type in ('travel_request', 'travel_payment', 'identity_verification', 'trip', 'product_offer'));

-- Achat d'un boost avec durée choisie (1-7j) — SURCHARGE de
-- purchase_boost_virement (4 arguments, p_duration_days en plus), PAS un
-- remplacement de la version 3-arg ci-dessus : Postgres/PostgREST
-- distinguent les deux par arité, aucune ambiguïté, aucun DROP nécessaire.
-- p_item_type accepte maintenant 'request' en plus de 'trip'/'offer' — le
-- propriétaire est client_id (pas voyageur_id) dans ce cas, boost_payments
-- .voyageur_id reste renseigné avec ce même id malgré son nom (la colonne
-- désignait déjà "le profil qui a payé", pas un rôle distinct — ce projet
-- n'a que 2 rôles, client et admin, cf. types/database.ts).
--
-- Prix calculé ICI à partir de p_duration_days (jamais un prix envoyé par
-- le client) — si aucune ligne boost_pricing_tiers ne correspond, rejeté
-- explicitement (durée hors grille 1-7).
create or replace function public.purchase_boost_virement(
  p_item_type text,
  p_item_id uuid,
  p_payment_proof_url text,
  p_duration_days integer
)
returns table (payment_id uuid, new_boosted_until timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_status text;
  v_current_boosted_until timestamptz;
  v_price numeric(10,3);
  v_new_boosted_until timestamptz;
  v_payment_id uuid;
begin
  if p_item_type not in ('trip', 'offer', 'request') then
    raise exception 'Type d''item invalide : %.', p_item_type;
  end if;
  if p_payment_proof_url is null then
    raise exception 'Preuve de virement manquante.';
  end if;

  select price_tnd into v_price from public.boost_pricing_tiers where duration_days = p_duration_days;
  if v_price is null then
    raise exception 'Durée invalide : % (doit être entre 1 et 7 jours).', p_duration_days;
  end if;

  if p_item_type = 'trip' then
    select voyageur_id, status, boosted_until
      into v_owner_id, v_status, v_current_boosted_until
    from public.trips
    where id = p_item_id
    for update;
  elsif p_item_type = 'offer' then
    select voyageur_id, status, boosted_until
      into v_owner_id, v_status, v_current_boosted_until
    from public.product_offers
    where id = p_item_id
    for update;
  else
    select client_id, status, boosted_until
      into v_owner_id, v_status, v_current_boosted_until
    from public.travel_requests
    where id = p_item_id
    for update;
  end if;

  if v_owner_id is null then
    raise exception 'Introuvable.';
  end if;
  if v_owner_id <> auth.uid() then
    raise exception 'Seul le propriétaire peut booster cet item.';
  end if;
  if v_status <> 'open' then
    raise exception 'Seul un item disponible (''open'') peut être boosté.';
  end if;

  v_new_boosted_until := greatest(coalesce(v_current_boosted_until, now()), now()) + (p_duration_days || ' days')::interval;

  insert into public.boost_payments (
    voyageur_id, trip_id, product_offer_id, request_id, payment_method, payment_proof_url, amount, duration_days
  ) values (
    auth.uid(),
    case when p_item_type = 'trip' then p_item_id else null end,
    case when p_item_type = 'offer' then p_item_id else null end,
    case when p_item_type = 'request' then p_item_id else null end,
    'virement', p_payment_proof_url, v_price, p_duration_days
  ) returning id into v_payment_id;

  if p_item_type = 'trip' then
    update public.trips set boosted_until = v_new_boosted_until where id = p_item_id;
  elsif p_item_type = 'offer' then
    update public.product_offers set boosted_until = v_new_boosted_until where id = p_item_id;
  else
    update public.travel_requests set boosted_until = v_new_boosted_until where id = p_item_id;
  end if;

  -- Notifications boost (chantier notifications+admin pricing), brique
  -- 1/3 — "Confirmation de virement reçue". Déjà SECURITY DEFINER ici,
  -- insertion directe (même raisonnement que REQUEST_UPDATE dans
  -- accept_travel_proposal ci-dessus) : pas de détour par
  -- create_notification()/service_role. related_object_type suit
  -- p_item_type ('trip'/'product_offer' nouvellement ajoutés à la
  -- contrainte, 'travel_request' déjà existant) pour que hrefFor() côté
  -- TypeScript renvoie vers la bonne page de détail.
  insert into public.notifications (user_id, type, priority, title, body, related_object_type, related_object_id)
  values (
    v_owner_id, 'boost_update', 'normal',
    'Confirmation de virement reçue',
    'Ta mise en avant est active dès maintenant, en attendant la vérification du virement.',
    case p_item_type
      when 'trip' then 'trip'
      when 'offer' then 'product_offer'
      else 'travel_request'
    end,
    p_item_id
  );

  payment_id := v_payment_id;
  new_boosted_until := v_new_boosted_until;
  return next;
end;
$$;

revoke execute on function public.purchase_boost_virement(text, uuid, text, integer) from public;
revoke execute on function public.purchase_boost_virement(text, uuid, text, integer) from anon;
grant execute on function public.purchase_boost_virement(text, uuid, text, integer) to authenticated;

-- Notifications boost (chantier notifications+admin pricing), brique 3/3 —
-- "Boost terminé". boosted_until peut expirer à n'importe quelle heure
-- (durée en jours, mais posée sur un timestamp précis à l'achat) : pas
-- assez réactif de réutiliser auto_release_stale_payments (quotidien 3h)
-- tel quel, cf. le cron horaire dédié plus bas.
--
-- boost_expiry_notified_at plutôt qu'un simple "boosted_until < now()" :
-- idempotence — sans cette colonne, chaque run du cron renotifierait tous
-- les items déjà expirés depuis le run précédent. Comparée à boosted_until
-- (pas juste "is not null") pour gérer le re-boost après expiration : un
-- item déjà notifié une fois, puis re-boosté puis re-expiré, doit
-- redéclencher une notification (boost_expiry_notified_at < le NOUVEAU
-- boosted_until, donc plus "à jour").
alter table public.trips add column if not exists boost_expiry_notified_at timestamptz;
alter table public.product_offers add column if not exists boost_expiry_notified_at timestamptz;
alter table public.travel_requests add column if not exists boost_expiry_notified_at timestamptz;

-- returns table (item_type, item_id) plutôt que void : observabilité au
-- même titre que auto_release_stale_payments (returns table
-- released_request_id) — permet de vérifier ce qu'un run a traité,
-- notamment pour le test en direct de ce commit.
create or replace function public.notify_expired_boosts()
returns table (item_type text, item_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    select id, voyageur_id as owner_id from public.trips
    where boosted_until is not null and boosted_until < now()
      and (boost_expiry_notified_at is null or boost_expiry_notified_at < boosted_until)
  loop
    insert into public.notifications (user_id, type, priority, title, body, related_object_type, related_object_id)
    values (v_row.owner_id, 'boost_update', 'normal', 'Boost terminé', 'La mise en avant de ton trajet est arrivée à échéance.', 'trip', v_row.id);
    update public.trips set boost_expiry_notified_at = now() where id = v_row.id;
    item_type := 'trip'; item_id := v_row.id; return next;
  end loop;

  for v_row in
    select id, voyageur_id as owner_id from public.product_offers
    where boosted_until is not null and boosted_until < now()
      and (boost_expiry_notified_at is null or boost_expiry_notified_at < boosted_until)
  loop
    insert into public.notifications (user_id, type, priority, title, body, related_object_type, related_object_id)
    values (v_row.owner_id, 'boost_update', 'normal', 'Boost terminé', 'La mise en avant de ton offre est arrivée à échéance.', 'product_offer', v_row.id);
    update public.product_offers set boost_expiry_notified_at = now() where id = v_row.id;
    item_type := 'offer'; item_id := v_row.id; return next;
  end loop;

  -- travel_requests, contrairement à trips/product_offers, a un trigger
  -- d'invariants (enforce_travel_request_transitions) qui rejette toute
  -- update venant d'un acteur qui n'est ni le client, ni le voyageur
  -- accepté, ni admin — SECURITY DEFINER contourne les policies RLS mais
  -- PAS les triggers (même commentaire déjà posé sur
  -- enforce_travel_request_transitions ci-dessus). Bypass explicite,
  -- exactement comme accept_travel_proposal()/auto_release_stale_payments()
  -- le font déjà pour la même raison — trouvé en testant en direct (bug
  -- réel : "Non autorisé à modifier cette demande.", pas une régression,
  -- jamais fonctionné sans ce bypass).
  perform set_config('jibli.bypass_transition_checks', 'true', true);

  for v_row in
    select id, client_id as owner_id from public.travel_requests
    where boosted_until is not null and boosted_until < now()
      and (boost_expiry_notified_at is null or boost_expiry_notified_at < boosted_until)
  loop
    insert into public.notifications (user_id, type, priority, title, body, related_object_type, related_object_id)
    values (v_row.owner_id, 'boost_update', 'normal', 'Boost terminé', 'La mise en avant de ta demande est arrivée à échéance.', 'travel_request', v_row.id);
    update public.travel_requests set boost_expiry_notified_at = now() where id = v_row.id;
    item_type := 'request'; item_id := v_row.id; return next;
  end loop;

  perform set_config('jibli.bypass_transition_checks', 'false', true);
end;
$$;

-- Même posture que create_notification() : SECURITY DEFINER + revoke
-- explicite des rôles concrets (le grant par défaut à authenticated de ce
-- projet Supabase n'est pas retiré par un simple revoke from public, cf.
-- correctif documenté sur create_notification ci-dessus) — cette fonction
-- écrit des notifications pour n'importe quel utilisateur, jamais
-- appelable en libre-service. Seul pg_cron (contexte système, hors
-- rôles PostgREST) et un admin via le SQL Editor peuvent l'invoquer.
revoke execute on function public.notify_expired_boosts() from public;
revoke execute on function public.notify_expired_boosts() from authenticated;
revoke execute on function public.notify_expired_boosts() from anon;

-- pg_cron horaire (contrairement au quotidien 3h de
-- auto-release-stale-payments, cf. commentaire sur boost_expiry_notified_at
-- ci-dessus). create extension if not exists : déjà exécuté par le bloc
-- auto-release-stale-payments plus haut si ce script tourne dans l'ordre,
-- mais idempotent et sans coût si répété — mêmes garde-fous que là-bas si
-- jamais exécuté seul.
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'notify-expired-boosts') then
    perform cron.schedule(
      'notify-expired-boosts',
      '0 * * * *', -- toutes les heures, à l'heure pile (heure du serveur, généralement UTC)
      $cron$select public.notify_expired_boosts();$cron$
    );
  end if;
end $$;

-- ============================================================================
-- Table: wallet_deposits (chantier portefeuille interne, brique 1/N — dépôt
-- par virement ; Flouci viendra en brique 2/N)
--
-- Journal des dépôts vers profiles.wallet_balance — volontairement SÉPARÉ
-- de wallet_credits (parrainage, reason contraint à un enum spécifique) et
-- de wallet_adjustments (ajustements manuels admin) : même raisonnement que
-- la séparation déjà actée entre ces deux-là (cf. commentaire sur
-- wallet_adjustments plus haut). wallet_balance reste le solde partagé unique
-- entre les trois — seuls les JOURNAUX sont distincts.
--
-- Contrairement à purchase_boost_virement (qui active le boost IMMÉDIATEMENT
-- à l'achat, avant toute vérification admin) : créditer wallet_balance sur
-- une preuve de virement non vérifiée serait de l'argent réellement
-- dépensable créé à partir d'une preuve falsifiable — un vecteur de fraude
-- réel, contrairement à quelques heures de mise en avant boost à faible
-- enjeu. Donc status reste 'awaiting_verification' jusqu'à vérification
-- admin explicite ; le crédit n'a lieu qu'à ce moment (trigger ci-dessous).
-- ============================================================================
do $$ begin
  create type public.wallet_deposit_status as enum ('awaiting_verification', 'credited', 'rejected');
exception when duplicate_object then null; end $$;

create table if not exists public.wallet_deposits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  amount numeric(10,3) not null check (amount > 0),
  payment_method public.payment_method not null check (payment_method in ('virement', 'flouci')),
  -- virement uniquement ; contrainte défensive ci-dessous. payment_ref
  -- (flouci uniquement) reste nullable ici, sans contrainte symétrique :
  -- la brique 2/N (RPC credit_wallet_deposit_flouci) insère directement en
  -- 'credited' avec payment_ref déjà posé, jamais une ligne 'awaiting_
  -- verification' en attente côté flouci (pas de pré-insertion avant
  -- paiement, même choix que accept_travel_proposal côté flouci : rien
  -- n'est enregistré avant confirmation réelle de l'API).
  payment_proof_url text,
  payment_ref text,
  status public.wallet_deposit_status not null default 'awaiting_verification',
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_deposits_virement_has_proof check (payment_method <> 'virement' or payment_proof_url is not null)
);

create index if not exists wallet_deposits_profile_idx on public.wallet_deposits(profile_id);
create index if not exists wallet_deposits_status_idx on public.wallet_deposits(status);

drop trigger if exists trg_wallet_deposits_updated_at on public.wallet_deposits;
create trigger trg_wallet_deposits_updated_at
  before update on public.wallet_deposits
  for each row execute function public.set_updated_at();

alter table public.wallet_deposits enable row level security;

drop policy if exists "wallet_deposits_select_own_or_admin" on public.wallet_deposits;
create policy "wallet_deposits_select_own_or_admin"
  on public.wallet_deposits for select
  using (profile_id = auth.uid() or public.is_admin());

-- Insert direct autorisé (contrairement à boost_payments/withdrawal_
-- requests) : contrairement à purchase_boost_virement, aucun autre effet
-- de bord n'est nécessaire à la soumission (le crédit n'arrive qu'à la
-- vérification, cf. trigger plus bas) — pas besoin d'une RPC juste pour un
-- insert simple. status/payment_method forcés par le WITH CHECK : un
-- client ne peut jamais insérer directement une ligne déjà 'credited', ni
-- une ligne 'flouci' (réservé à la RPC de la brique 2/N, SECURITY DEFINER,
-- qui contourne cette policy).
drop policy if exists "wallet_deposits_insert_own" on public.wallet_deposits;
create policy "wallet_deposits_insert_own"
  on public.wallet_deposits for insert
  with check (
    profile_id = auth.uid()
    and status = 'awaiting_verification'
    and payment_method = 'virement'
  );

drop policy if exists "wallet_deposits_update_admin_only" on public.wallet_deposits;
create policy "wallet_deposits_update_admin_only"
  on public.wallet_deposits for update
  using (public.is_admin());

-- Crédite profiles.wallet_balance quand une ligne ARRIVE 'credited' — que ce
-- soit à l'INSERT (chemin Flouci, brique 2/N : la RPC insère directement en
-- 'credited', jamais exercé par ce commit) ou à l'UPDATE (chemin virement,
-- vérification admin ci-dessous, seul chemin réellement actif dans cette
-- brique). Un seul trigger, un seul endroit qui écrit le solde, pour les
-- deux méthodes de paiement — jamais deux implémentations du crédit à
-- maintenir en synchro.
create or replace function public.credit_wallet_balance_on_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'credited' and (tg_op = 'INSERT' or old.status is distinct from 'credited') then
    update public.profiles set wallet_balance = wallet_balance + new.amount where id = new.profile_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wallet_deposits_credit_balance on public.wallet_deposits;
create trigger trg_wallet_deposits_credit_balance
  after insert or update on public.wallet_deposits
  for each row execute function public.credit_wallet_balance_on_deposit();

-- ============================================================================
-- Fin du schéma. 2 rôles : client, admin (le rôle "commerce" — courses,
-- catalogue, livraison zone tarifée — a existé puis a été retiré
-- intégralement, cf. tête de fichier).
--
-- À faire manuellement dans le dashboard Supabase (non scriptable en SQL) :
--   1. Authentication > Providers > Email : confirmation email activée
--      (comportement par défaut), Site URL + Redirect URLs à renseigner
--      avec le domaine de l'app (ex: http://localhost:3000 en dev, avec
--      /auth/callback autorisé).
--   2. Pour tester le virement, insérer une ligne dans bank_transfer_info
--      (is_active = true) — la gestion depuis /admin/parametres/virement
--      existe déjà.
--   3. Crowd-shipping : rien à faire à la main, le bucket
--      travel-request-photos est créé par ce script comme payment-proofs.
--   4. Escrow : renseigner FLOUCI_APP_TOKEN / FLOUCI_APP_SECRET dans
--      .env.local (Flouci dashboard) — sans ça, l'option Flouci reste
--      visible mais désactivée avec un message clair. Le premier compte
--      admin doit être créé manuellement (update profiles set role='admin'
--      where id=...) pour pouvoir accéder à /admin/jibli-paiements
--      (validation virement).
-- ==========================================================================