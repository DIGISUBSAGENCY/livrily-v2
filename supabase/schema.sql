-- ============================================================================
-- Livrily 2.0 — Schéma de base de données Supabase (Postgres + PostGIS)
-- ============================================================================
-- À exécuter en une fois dans le SQL Editor du dashboard Supabase, sur un
-- projet neuf. Idempotent autant que possible (IF NOT EXISTS) pour pouvoir
-- être ré-appliqué sans tout casser pendant le développement.
--
-- Modèle métier : il n'y a PAS de rôle "livreur" indépendant sur la
-- plateforme. C'est le commerce partenaire lui-même qui livre ses
-- commandes (gérant, employé, ou livreur qu'il emploie en interne — sans
-- compte utilisateur sur Livrily). Le compte "commerce" (un seul par
-- commerce, via commerces.owner_id) gère catalogue + commandes reçues +
-- passage au statut "delivering"/"delivered", et c'est son téléphone qui
-- envoie la position GPS pendant la livraison. `commerce_delivery_staff`
-- n'est qu'un registre interne (nom/téléphone) permettant d'indiquer qui,
-- physiquement, a pris la commande — il ne donne aucun accès à la plateforme.
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
do $$ begin
  create type public.user_role as enum ('client', 'commerce', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.commerce_category as enum ('supermarche', 'boulangerie', 'fruits_legumes');
exception when duplicate_object then null; end $$;

-- Phase 5 — Module 7 : catégorie pharmacie (produits sur ordonnance).
-- ADD VALUE IF NOT EXISTS ne peut pas être utilisée dans la même transaction
-- qu'un usage de la valeur — sans effet ici car schema.sql ne l'utilise pas
-- plus loin dans le même script.
alter type public.commerce_category add value if not exists 'pharmacie';

do $$ begin
  create type public.order_status as enum (
    'pending',    -- commande passée par le client, en attente de prise en charge par le commerce
    'accepted',   -- acceptée par le commerce, en préparation
    'ready',      -- prête, en attente de départ en livraison
    'delivering', -- le commerce (ou son livreur interne) est en route vers le client
    'delivered',  -- livrée
    'cancelled'   -- annulée (client, commerce ou admin)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'flouci', 'virement');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'paid', 'awaiting_verification', 'rejected', 'failed');
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
-- fonction est définie avant que `profiles`/`commerces` n'existent plus bas
-- dans ce script — plpgsql est donc nécessaire ici, pas juste un style.
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

-- Vérifie si l'utilisateur courant est le compte "commerce" propriétaire du
-- commerce donné. Même logique SECURITY DEFINER (et même raison plpgsql)
-- que is_admin() ci-dessus.
create or replace function public.is_commerce_owner(p_commerce_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.commerces
    where id = p_commerce_id and owner_id = auth.uid()
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
-- Les écritures légitimes (grant_referral_reward, débit au checkout via le
-- client admin) contournent ce trigger : la première parce que l'utilisateur
-- affecté n'est jamais l'acteur de la requête (c'est le commerce/l'admin qui
-- fait passer la commande à "delivered"), la seconde parce que le client
-- admin n'a pas de auth.uid() (NULL = old.id est toujours faux).
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
-- parrain. Les rôles commerce/admin sont attribués manuellement par un
-- admin ensuite (le self-service signup ne crée jamais autre chose qu'un
-- compte client).
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
-- Table: delivery_zones
-- Zones de livraison. MVP = zone circulaire (centre + rayon), simple à
-- dessiner et à interroger (ST_DWithin). La colonne `polygon` est prévue
-- pour un futur affinage (dessin de polygone précis) mais n'est pas utilisée
-- par la logique MVP.
-- ============================================================================
create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  center_lat double precision not null,
  center_lng double precision not null,
  center_location geography(Point, 4326),
  radius_meters integer not null check (radius_meters > 0),
  polygon geography(Polygon, 4326), -- réservé à un usage futur, non utilisé en MVP
  -- Phase 5 — Module 5 : `delivery_fee` sert désormais de frais de BASE
  -- (fixe), auquel s'ajoute `fee_per_km` × distance réelle commerce→client
  -- (cf. lib/pricing/deliveryFee.ts). Nom de colonne conservé tel quel pour
  -- ne pas casser orders.delivery_fee (snapshot du montant final, lui
  -- inchangé) ni le reste du code déjà écrit dessus.
  delivery_fee numeric(10,3) not null default 0 check (delivery_fee >= 0),
  fee_per_km numeric(10,3) not null default 0 check (fee_per_km >= 0),
  min_order_amount numeric(10,3) not null default 0 check (min_order_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.delivery_zones add column if not exists fee_per_km numeric(10,3) not null default 0 check (fee_per_km >= 0);

create index if not exists delivery_zones_active_idx on public.delivery_zones(is_active);
create index if not exists delivery_zones_center_gix on public.delivery_zones using gist(center_location);

-- ============================================================================
-- Table: zone_surge_rules
-- ============================================================================
-- Majoration temporaire des frais de livraison sur une zone (heures de
-- pointe). Configuration admin uniquement (cf. RLS plus bas) ; le calcul
-- réel se fait côté serveur via lib/pricing/deliveryFee.ts, jamais exposé
-- tel quel au client.
create table if not exists public.zone_surge_rules (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.delivery_zones(id) on delete cascade,
  label text not null,
  -- 0=dimanche .. 6=samedi (convention JS Date#getDay()).
  days_of_week smallint[] not null default '{0,1,2,3,4,5,6}',
  start_time time not null,
  end_time time not null,
  multiplier numeric(4,2) not null check (multiplier > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time) -- pas de créneau traversant minuit, cf. lib/pricing/deliveryFee.ts
);

create index if not exists zone_surge_rules_zone_idx on public.zone_surge_rules(zone_id);

drop trigger if exists trg_zone_surge_rules_updated_at on public.zone_surge_rules;
create trigger trg_zone_surge_rules_updated_at
  before update on public.zone_surge_rules
  for each row execute function public.set_updated_at();

create or replace function public.sync_zone_center_location()
returns trigger
language plpgsql
as $$
begin
  new.center_location = ST_SetSRID(ST_MakePoint(new.center_lng, new.center_lat), 4326)::geography;
  return new;
end;
$$;

drop trigger if exists trg_zones_sync_location on public.delivery_zones;
create trigger trg_zones_sync_location
  before insert or update of center_lat, center_lng on public.delivery_zones
  for each row execute function public.sync_zone_center_location();

drop trigger if exists trg_zones_updated_at on public.delivery_zones;
create trigger trg_zones_updated_at
  before update on public.delivery_zones
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Table: commerces
-- owner_id = le compte utilisateur (role = 'commerce') qui gère ce commerce
-- (catalogue, commandes reçues, livraison). Un seul compte par commerce ;
-- le personnel de livraison interne n'a pas de compte (cf. commerce_delivery_staff).
-- ============================================================================
create table if not exists public.commerces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  category public.commerce_category not null,
  description text,
  logo_url text,
  address text,
  lat double precision,
  lng double precision,
  location geography(Point, 4326),
  zone_id uuid references public.delivery_zones(id) on delete set null,
  phone text,
  is_active boolean not null default true, -- désactivation par l'admin (compte suspendu, faute grave...)
  is_open boolean not null default true, -- fermeture temporaire pilotée par le commerce lui-même (pause, jour férié...)
  -- Phase 5 — Module 2 : compteurs bruts entretenus par
  -- update_commerce_reliability_stats() (trigger sur orders), jamais
  -- écrits à la main. Les ratios ci-dessous sont des colonnes générées.
  stats_delivered_count integer not null default 0,
  stats_delivery_minutes_sum numeric not null default 0,
  stats_on_time_count integer not null default 0,
  stats_decided_count integer not null default 0,
  stats_accepted_count integer not null default 0,
  avg_delivery_time_minutes numeric generated always as (
    case when stats_delivered_count > 0 then round(stats_delivery_minutes_sum / stats_delivered_count, 1) else null end
  ) stored,
  on_time_rate numeric generated always as (
    case when stats_delivered_count > 0 then round(100.0 * stats_on_time_count / stats_delivered_count, 1) else null end
  ) stored,
  acceptance_rate numeric generated always as (
    case when stats_decided_count > 0 then round(100.0 * stats_accepted_count / stats_decided_count, 1) else null end
  ) stored,
  -- Phase 5 — Module 6 : agrégat des avis clients (table ratings), entretenu
  -- par update_commerce_ratings_stats() (trigger sur ratings).
  ratings_sum integer not null default 0,
  ratings_count integer not null default 0,
  ratings_avg numeric generated always as (
    case when ratings_count > 0 then round(ratings_sum::numeric / ratings_count, 1) else null end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrations douces : ajoutent les colonnes si le schéma a déjà été exécuté
-- avant leur introduction (Phase 5, Modules 2 et 3).
alter table public.commerces add column if not exists is_open boolean not null default true;
alter table public.commerces add column if not exists stats_delivered_count integer not null default 0;
alter table public.commerces add column if not exists stats_delivery_minutes_sum numeric not null default 0;
alter table public.commerces add column if not exists stats_on_time_count integer not null default 0;
alter table public.commerces add column if not exists stats_decided_count integer not null default 0;
alter table public.commerces add column if not exists stats_accepted_count integer not null default 0;
alter table public.commerces add column if not exists avg_delivery_time_minutes numeric
  generated always as (
    case when stats_delivered_count > 0 then round(stats_delivery_minutes_sum / stats_delivered_count, 1) else null end
  ) stored;
alter table public.commerces add column if not exists on_time_rate numeric
  generated always as (
    case when stats_delivered_count > 0 then round(100.0 * stats_on_time_count / stats_delivered_count, 1) else null end
  ) stored;
alter table public.commerces add column if not exists acceptance_rate numeric
  generated always as (
    case when stats_decided_count > 0 then round(100.0 * stats_accepted_count / stats_decided_count, 1) else null end
  ) stored;
alter table public.commerces add column if not exists ratings_sum integer not null default 0;
alter table public.commerces add column if not exists ratings_count integer not null default 0;
alter table public.commerces add column if not exists ratings_avg numeric
  generated always as (
    case when ratings_count > 0 then round(ratings_sum::numeric / ratings_count, 1) else null end
  ) stored;

create unique index if not exists commerces_owner_unique_idx on public.commerces(owner_id) where owner_id is not null;
create index if not exists commerces_category_idx on public.commerces(category);
create index if not exists commerces_zone_idx on public.commerces(zone_id);
create index if not exists commerces_active_idx on public.commerces(is_active);
create index if not exists commerces_location_gix on public.commerces using gist(location);

create or replace function public.sync_commerce_location()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.location = ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  else
    new.location = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_commerces_sync_location on public.commerces;
create trigger trg_commerces_sync_location
  before insert or update of lat, lng on public.commerces
  for each row execute function public.sync_commerce_location();

drop trigger if exists trg_commerces_updated_at on public.commerces;
create trigger trg_commerces_updated_at
  before update on public.commerces
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Table: products
-- ============================================================================
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  commerce_id uuid not null references public.commerces(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,3) not null check (price >= 0),
  image_url text,
  unit text not null default 'pièce', -- ex: pièce, kg, L
  is_available boolean not null default true,
  -- Phase 5 — Module 7 : produit de pharmacie nécessitant une ordonnance
  -- (le commerce a un rôle purement indicatif dans le choix, rien n'empêche
  -- techniquement de le cocher hors catégorie pharmacie — pas de contrainte
  -- de cohérence en base, jugé disproportionné pour un MVP).
  requires_prescription boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists requires_prescription boolean not null default false;

create index if not exists products_commerce_idx on public.products(commerce_id);
create index if not exists products_available_idx on public.products(is_available);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Table: commerce_delivery_staff
-- Registre interne du personnel de livraison d'un commerce (nom/téléphone).
-- AUCUN compte utilisateur associé — sert uniquement à tracer qui a pris la
-- commande, référencé en option par orders.delivery_staff_id.
-- ============================================================================
create table if not exists public.commerce_delivery_staff (
  id uuid primary key default gen_random_uuid(),
  commerce_id uuid not null references public.commerces(id) on delete cascade,
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_staff_commerce_idx on public.commerce_delivery_staff(commerce_id);

drop trigger if exists trg_delivery_staff_updated_at on public.commerce_delivery_staff;
create trigger trg_delivery_staff_updated_at
  before update on public.commerce_delivery_staff
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Table: orders
-- ============================================================================
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id),
  commerce_id uuid not null references public.commerces(id),
  delivery_staff_id uuid references public.commerce_delivery_staff(id) on delete set null, -- optionnel : qui livre, en interne au commerce
  zone_id uuid references public.delivery_zones(id), -- zone utilisée pour le calcul des frais, figée à la commande
  status public.order_status not null default 'pending',
  delivery_address text not null,
  delivery_lat double precision,
  delivery_lng double precision,
  delivery_location geography(Point, 4326),
  subtotal numeric(10,3) not null check (subtotal >= 0),
  delivery_fee numeric(10,3) not null default 0 check (delivery_fee >= 0),
  total numeric(10,3) not null check (total >= 0),
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  payment_ref text, -- référence transaction Flouci
  payment_proof_url text, -- chemin storage bucket payment-proofs pour le virement
  payment_verified_by uuid references public.profiles(id),
  payment_verified_at timestamptz,
  client_note text,
  cancelled_reason text,
  -- Phase 5 — Module 6 : chemin storage bucket delivery-proofs, renseigné
  -- par le commerce au moment de marquer la commande "delivered" (photo
  -- obligatoire, cf. enforce_delivery_proof_required ci-dessous).
  delivery_proof_url text,
  -- Phase 5 — Module 7 : chemin storage bucket prescriptions, renseigné au
  -- checkout si le panier contient au moins un produit requires_prescription.
  prescription_url text,
  -- Phase 5 — Module 8 : crédit portefeuille appliqué sur les frais de
  -- livraison à ce checkout (0 si non utilisé). delivery_fee reste le coût
  -- de livraison réel non réduit (comptabilité commerce/stats inchangées) ;
  -- total = subtotal + delivery_fee - wallet_credit_applied.
  wallet_credit_applied numeric(10,3) not null default 0 check (wallet_credit_applied >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists delivery_proof_url text;
alter table public.orders add column if not exists prescription_url text;
alter table public.orders add column if not exists wallet_credit_applied numeric(10,3) not null default 0 check (wallet_credit_applied >= 0);

create index if not exists orders_client_idx on public.orders(client_id);
create index if not exists orders_commerce_idx on public.orders(commerce_id);
create index if not exists orders_delivery_staff_idx on public.orders(delivery_staff_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_payment_status_idx on public.orders(payment_status);
create index if not exists orders_zone_idx on public.orders(zone_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

create or replace function public.sync_order_delivery_location()
returns trigger
language plpgsql
as $$
begin
  if new.delivery_lat is not null and new.delivery_lng is not null then
    new.delivery_location = ST_SetSRID(ST_MakePoint(new.delivery_lng, new.delivery_lat), 4326)::geography;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_sync_location on public.orders;
create trigger trg_orders_sync_location
  before insert or update of delivery_lat, delivery_lng on public.orders
  for each row execute function public.sync_order_delivery_location();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Point d'attention métier : une commande payée par virement ne doit jamais
-- passer de pending à accepted (donc jamais être traitée par le commerce)
-- tant que l'admin n'a pas validé le paiement. Ce garde-fou est appliqué en
-- base, en plus du contrôle applicatif côté Server Action, pour qu'aucun
-- chemin d'écriture ne puisse le contourner.
create or replace function public.enforce_virement_payment_gating()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'pending' and new.status = 'accepted'
     and new.payment_method = 'virement' and new.payment_status is distinct from 'paid' then
    raise exception 'Commande par virement : passage à "accepted" impossible tant que le paiement n''est pas vérifié (payment_status doit être "paid").';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_virement_gating on public.orders;
create trigger trg_orders_virement_gating
  before update on public.orders
  for each row execute function public.enforce_virement_payment_gating();

-- Phase 5 — Module 6 : photo de preuve de livraison obligatoire pour le
-- commerce. Vérifié en base (en plus du contrôle côté Server Action
-- markOrderDelivered) pour qu'aucun chemin d'écriture commerce ne puisse
-- marquer une commande livrée sans preuve — même logique que
-- enforce_virement_payment_gating ci-dessus. L'admin reste exempté (comme
-- enforce_commerce_order_transitions) : "forcer le statut" doit rester un
-- vrai déblocage de dernier recours, cf. AdminOrderControls.
create or replace function public.enforce_delivery_proof_required()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'delivering' and new.status = 'delivered'
     and new.delivery_proof_url is null and not public.is_admin() then
    raise exception 'Une photo de preuve de livraison est obligatoire pour marquer cette commande comme livrée.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_delivery_proof_required on public.orders;
create trigger trg_orders_delivery_proof_required
  before update on public.orders
  for each row execute function public.enforce_delivery_proof_required();

-- Phase 3 : le compte commerce peut faire avancer le statut de sa propre
-- commande, mais seulement selon la séquence attendue, et sans pouvoir
-- toucher aux montants/paiement/adresse (ces champs restent sous contrôle
-- du client au checkout et de l'admin côté paiement). L'admin contourne
-- cette fonction (ses outils Phase 4 gèrent l'assignation manuelle, etc.).
create or replace function public.enforce_commerce_order_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_commerce_owner(old.commerce_id) and not public.is_admin() then
    if new.client_id is distinct from old.client_id
       or new.commerce_id is distinct from old.commerce_id
       or new.zone_id is distinct from old.zone_id
       or new.delivery_address is distinct from old.delivery_address
       or new.delivery_lat is distinct from old.delivery_lat
       or new.delivery_lng is distinct from old.delivery_lng
       or new.subtotal is distinct from old.subtotal
       or new.delivery_fee is distinct from old.delivery_fee
       or new.total is distinct from old.total
       or new.payment_method is distinct from old.payment_method
       or new.payment_status is distinct from old.payment_status
       or new.payment_ref is distinct from old.payment_ref
       or new.payment_proof_url is distinct from old.payment_proof_url
       or new.payment_verified_by is distinct from old.payment_verified_by
       or new.payment_verified_at is distinct from old.payment_verified_at
    then
      raise exception 'Le compte commerce ne peut modifier que le statut (et le personnel de livraison) de la commande.';
    end if;

    if new.status is distinct from old.status
       and not (
         (old.status = 'pending' and new.status in ('accepted', 'cancelled'))
         or (old.status = 'accepted' and new.status in ('ready', 'cancelled'))
         or (old.status = 'ready' and new.status in ('delivering', 'cancelled'))
         or (old.status = 'delivering' and new.status = 'delivered')
       )
    then
      raise exception 'Transition de statut invalide : % → %', old.status, new.status;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_commerce_transitions on public.orders;
create trigger trg_orders_commerce_transitions
  before update on public.orders
  for each row execute function public.enforce_commerce_order_transitions();

-- Phase 5 — Module 2 : fiabilité du commerce, entretenue automatiquement à
-- chaque transition d'intérêt (compteurs incrémentaux, pas de recalcul sur
-- tout l'historique à chaque lecture). "À l'heure" : livrée en moins de
-- on_time_threshold_minutes à compter de la création de la commande — il
-- n'y a pas de délai promis au client pour l'instant, seuil choisi pour ce
-- type de livraison (courses/boulangerie/fruits&légumes, pas de repas chaud).
-- L'acceptation/le refus ne compte que la décision du commerce lui-même
-- (exclut les interventions admin hors séquence, cf. is_commerce_owner ci-
-- dessous) ; le temps de livraison/ponctualité compte toute commande
-- effectivement livrée, quel que soit l'acteur qui a posé le statut final.
create or replace function public.update_commerce_reliability_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  on_time_threshold_minutes constant numeric := 45;
  delivery_minutes numeric;
begin
  if old.status = 'pending' and public.is_commerce_owner(old.commerce_id) and not public.is_admin() then
    if new.status = 'accepted' then
      update public.commerces
      set stats_decided_count = stats_decided_count + 1,
          stats_accepted_count = stats_accepted_count + 1
      where id = new.commerce_id;
    elsif new.status = 'cancelled' then
      update public.commerces
      set stats_decided_count = stats_decided_count + 1
      where id = new.commerce_id;
    end if;
  end if;

  if old.status = 'delivering' and new.status = 'delivered' then
    delivery_minutes := extract(epoch from (new.updated_at - new.created_at)) / 60;
    update public.commerces
    set stats_delivered_count = stats_delivered_count + 1,
        stats_delivery_minutes_sum = stats_delivery_minutes_sum + delivery_minutes,
        stats_on_time_count = stats_on_time_count
          + case when delivery_minutes <= on_time_threshold_minutes then 1 else 0 end
    where id = new.commerce_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_reliability_stats on public.orders;
create trigger trg_orders_reliability_stats
  after update on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.update_commerce_reliability_stats();

-- Phase 4 admin : quand un virement de commande est rejeté par un admin
-- (payment_status → 'rejected', via /admin/paiements), le client doit
-- pouvoir renvoyer une preuve. Ce trigger restreint strictement ce qu'un
-- client peut changer sur sa propre commande à cette seule transition
-- (payment_proof_url + payment_status: rejected → awaiting_verification,
-- uniquement si payment_method='virement' et status='pending') — même
-- principe que enforce_commerce_order_transitions ci-dessus, pour le client.
create or replace function public.enforce_client_order_resubmit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.client_id = auth.uid() and not public.is_admin() and not public.is_commerce_owner(old.commerce_id) then
    if new.commerce_id is distinct from old.commerce_id
       or new.delivery_staff_id is distinct from old.delivery_staff_id
       or new.zone_id is distinct from old.zone_id
       or new.status is distinct from old.status
       or new.delivery_address is distinct from old.delivery_address
       or new.delivery_lat is distinct from old.delivery_lat
       or new.delivery_lng is distinct from old.delivery_lng
       or new.subtotal is distinct from old.subtotal
       or new.delivery_fee is distinct from old.delivery_fee
       or new.total is distinct from old.total
       or new.payment_method is distinct from old.payment_method
       or new.payment_ref is distinct from old.payment_ref
       or new.payment_verified_by is distinct from old.payment_verified_by
       or new.payment_verified_at is distinct from old.payment_verified_at
       or new.client_note is distinct from old.client_note
       or new.cancelled_reason is distinct from old.cancelled_reason
    then
      raise exception 'Le client ne peut que renvoyer une preuve de paiement rejetée.';
    end if;

    if new.payment_status is distinct from old.payment_status
       and not (
         old.payment_method = 'virement'
         and old.payment_status = 'rejected'
         and old.status = 'pending'
         and new.payment_status = 'awaiting_verification'
       )
    then
      raise exception 'Transition de paiement invalide pour le client.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_client_resubmit on public.orders;
create trigger trg_orders_client_resubmit
  before update on public.orders
  for each row execute function public.enforce_client_order_resubmit();

-- ============================================================================
-- Table: order_items
-- ============================================================================
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name_snapshot text not null, -- copie du nom au moment de la commande (le produit peut changer/disparaître ensuite)
  unit_price numeric(10,3) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  subtotal numeric(10,3) not null check (subtotal >= 0)
);

create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists order_items_product_idx on public.order_items(product_id);

-- ============================================================================
-- Table: delivery_tracking
-- Journal des positions GPS envoyées par le commerce pendant une livraison
-- (append-only). Il n'y a pas de compte "livreur" distinct : c'est toujours
-- le compte commerce (ou son téléphone) qui émet ces positions.
-- ============================================================================
create table if not exists public.delivery_tracking (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  commerce_id uuid not null references public.commerces(id),
  lat double precision not null,
  lng double precision not null,
  location geography(Point, 4326),
  recorded_at timestamptz not null default now()
);

create index if not exists delivery_tracking_order_idx on public.delivery_tracking(order_id, recorded_at desc);
create index if not exists delivery_tracking_commerce_idx on public.delivery_tracking(commerce_id);

create or replace function public.sync_tracking_location()
returns trigger
language plpgsql
as $$
begin
  new.location = ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  return new;
end;
$$;

drop trigger if exists trg_tracking_sync_location on public.delivery_tracking;
create trigger trg_tracking_sync_location
  before insert on public.delivery_tracking
  for each row execute function public.sync_tracking_location();

-- ============================================================================
-- Table: ratings
-- Note du client sur la prestation du commerce (catalogue + livraison —
-- il n'y a pas de livreur distinct à noter séparément).
-- ============================================================================
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  commerce_id uuid references public.commerces(id),
  score smallint not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists ratings_commerce_idx on public.ratings(commerce_id);

-- Phase 5 — Module 6 : agrège chaque nouvelle note sur commerces.ratings_sum
-- / ratings_count (compteurs incrémentaux, comme update_commerce_reliability_stats
-- ci-dessus) — pas de recalcul depuis tout l'historique à chaque lecture.
-- ratings.order_id est unique et l'insert est la seule opération permise par
-- RLS (pas d'update/delete client), donc pas de cas de double-comptage à gérer.
create or replace function public.update_commerce_ratings_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.commerce_id is not null then
    update public.commerces
    set ratings_sum = ratings_sum + new.score,
        ratings_count = ratings_count + 1
    where id = new.commerce_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ratings_update_commerce_stats on public.ratings;
create trigger trg_ratings_update_commerce_stats
  after insert on public.ratings
  for each row execute function public.update_commerce_ratings_stats();

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
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now()
);

create index if not exists wallet_credits_profile_idx on public.wallet_credits(profile_id);

-- Aucune règle fixe de parrainage : montant choisi ici, ajustable sans
-- migration. old.status/new.status : la même transition que les autres
-- effets de bord "livraison" (reliability stats, cf. plus haut).
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

drop trigger if exists trg_orders_referral_reward on public.orders;
create trigger trg_orders_referral_reward
  after update on public.orders
  for each row execute function public.grant_referral_reward();

-- Débit atomique du portefeuille (utilisation au checkout, cf.
-- checkout/actions.ts) : `wallet_balance = wallet_balance - montant`
-- directement en base plutôt qu'un lire-puis-écrire côté application
-- (évite toute course entre deux commandes concurrentes du même client).
-- Appelée uniquement via le client admin (service role) ; security definer
-- pour contourner prevent_wallet_self_edit comme le reste des écritures
-- système sur ces colonnes.
create or replace function public.debit_wallet(p_profile_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set wallet_balance = greatest(0, wallet_balance - p_amount)
  where id = p_profile_id;
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
alter table public.delivery_zones enable row level security;
alter table public.commerces enable row level security;
alter table public.products enable row level security;
alter table public.commerce_delivery_staff enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.delivery_tracking enable row level security;
alter table public.ratings enable row level security;
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

-- delivery_zones --------------------------------------------------------------
drop policy if exists "zones_select_active_or_admin" on public.delivery_zones;
create policy "zones_select_active_or_admin"
  on public.delivery_zones for select
  using (is_active or public.is_admin());

drop policy if exists "zones_write_admin" on public.delivery_zones;
create policy "zones_write_admin"
  on public.delivery_zones for insert
  with check (public.is_admin());

drop policy if exists "zones_update_admin" on public.delivery_zones;
create policy "zones_update_admin"
  on public.delivery_zones for update
  using (public.is_admin());

drop policy if exists "zones_delete_admin" on public.delivery_zones;
create policy "zones_delete_admin"
  on public.delivery_zones for delete
  using (public.is_admin());

-- zone_surge_rules --------------------------------------------------------
-- Admin uniquement, y compris en lecture : la configuration des majorations
-- n'a pas besoin d'être exposée telle quelle au client, seul le résultat
-- (frais final) l'est. lib/pricing/deliveryFee.ts lit cette table via le
-- client admin (service role), pas via la session du client connecté.
alter table public.zone_surge_rules enable row level security;

drop policy if exists "zone_surge_rules_admin_only" on public.zone_surge_rules;
create policy "zone_surge_rules_admin_only"
  on public.zone_surge_rules for all
  using (public.is_admin())
  with check (public.is_admin());

-- commerces -------------------------------------------------------------------
drop policy if exists "commerces_select_active_or_admin" on public.commerces;
create policy "commerces_select_active_or_admin"
  on public.commerces for select
  using (is_active or owner_id = auth.uid() or public.is_admin());

drop policy if exists "commerces_insert_admin" on public.commerces;
create policy "commerces_insert_admin"
  on public.commerces for insert
  with check (public.is_admin());

drop policy if exists "commerces_update_owner_or_admin" on public.commerces;
create policy "commerces_update_owner_or_admin"
  on public.commerces for update
  using (owner_id = auth.uid() or public.is_admin());
  -- is_active reste de fait réservé à l'admin : la Server Action du compte
  -- commerce (Phase 3) ne devra jamais exposer ce champ en écriture.

drop policy if exists "commerces_delete_admin" on public.commerces;
create policy "commerces_delete_admin"
  on public.commerces for delete
  using (public.is_admin());

-- products ----------------------------------------------------------------
drop policy if exists "products_select_available_or_admin" on public.products;
create policy "products_select_available_or_admin"
  on public.products for select
  using (
    public.is_admin()
    or public.is_commerce_owner(commerce_id)
    or (
      is_available
      and exists (select 1 from public.commerces c where c.id = products.commerce_id and c.is_active)
    )
  );

drop policy if exists "products_insert_owner_or_admin" on public.products;
create policy "products_insert_owner_or_admin"
  on public.products for insert
  with check (public.is_commerce_owner(commerce_id) or public.is_admin());

drop policy if exists "products_update_owner_or_admin" on public.products;
create policy "products_update_owner_or_admin"
  on public.products for update
  using (public.is_commerce_owner(commerce_id) or public.is_admin());

drop policy if exists "products_delete_owner_or_admin" on public.products;
create policy "products_delete_owner_or_admin"
  on public.products for delete
  using (public.is_commerce_owner(commerce_id) or public.is_admin());

-- commerce_delivery_staff -----------------------------------------------------
-- Registre interne : uniquement visible/gérable par le commerce propriétaire
-- et l'admin. Aucun accès client (ce n'est pas un compte plateforme).
drop policy if exists "delivery_staff_select_owner_or_admin" on public.commerce_delivery_staff;
create policy "delivery_staff_select_owner_or_admin"
  on public.commerce_delivery_staff for select
  using (public.is_commerce_owner(commerce_id) or public.is_admin());

drop policy if exists "delivery_staff_insert_owner_or_admin" on public.commerce_delivery_staff;
create policy "delivery_staff_insert_owner_or_admin"
  on public.commerce_delivery_staff for insert
  with check (public.is_commerce_owner(commerce_id) or public.is_admin());

drop policy if exists "delivery_staff_update_owner_or_admin" on public.commerce_delivery_staff;
create policy "delivery_staff_update_owner_or_admin"
  on public.commerce_delivery_staff for update
  using (public.is_commerce_owner(commerce_id) or public.is_admin());

drop policy if exists "delivery_staff_delete_owner_or_admin" on public.commerce_delivery_staff;
create policy "delivery_staff_delete_owner_or_admin"
  on public.commerce_delivery_staff for delete
  using (public.is_commerce_owner(commerce_id) or public.is_admin());

-- orders ----------------------------------------------------------------------
-- Le client crée sa propre commande (Phase 2 — checkout). Le commerce peut
-- mettre à jour le statut de ses commandes (Phase 3) ; le trigger
-- enforce_commerce_order_transitions ci-dessus restreint ce qu'il peut
-- réellement changer (statut + personnel de livraison, séquence valide).
drop policy if exists "orders_select_involved_or_admin" on public.orders;
create policy "orders_select_involved_or_admin"
  on public.orders for select
  using (client_id = auth.uid() or public.is_commerce_owner(commerce_id) or public.is_admin());

drop policy if exists "orders_write_admin_only_for_now" on public.orders;
drop policy if exists "orders_insert_own_or_admin" on public.orders;
create policy "orders_insert_own_or_admin"
  on public.orders for insert
  with check (client_id = auth.uid() or public.is_admin());

drop policy if exists "orders_update_admin_only_for_now" on public.orders;
drop policy if exists "orders_update_commerce_or_admin" on public.orders;
create policy "orders_update_commerce_or_admin"
  on public.orders for update
  using (public.is_commerce_owner(commerce_id) or public.is_admin());

-- Le client peut mettre à jour sa propre commande — en pratique restreint au
-- seul renvoi de preuve de virement rejetée par le trigger
-- enforce_client_order_resubmit ci-dessus (Phase 4 admin).
drop policy if exists "orders_update_client_resubmit_payment" on public.orders;
create policy "orders_update_client_resubmit_payment"
  on public.orders for update
  using (client_id = auth.uid());

-- order_items -------------------------------------------------------------
drop policy if exists "order_items_select_via_order" on public.order_items;
create policy "order_items_select_via_order"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and (o.client_id = auth.uid() or public.is_commerce_owner(o.commerce_id) or public.is_admin())
    )
  );

drop policy if exists "order_items_write_admin_only_for_now" on public.order_items;
drop policy if exists "order_items_insert_via_own_order" on public.order_items;
create policy "order_items_insert_via_own_order"
  on public.order_items for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.client_id = auth.uid()
    )
  );

-- delivery_tracking ---------------------------------------------------------
drop policy if exists "tracking_select_involved_or_admin" on public.delivery_tracking;
create policy "tracking_select_involved_or_admin"
  on public.delivery_tracking for select
  using (
    exists (
      select 1 from public.orders o
      where o.id = delivery_tracking.order_id
        and (o.client_id = auth.uid() or public.is_commerce_owner(o.commerce_id) or public.is_admin())
    )
  );

drop policy if exists "tracking_insert_commerce_owner" on public.delivery_tracking;
create policy "tracking_insert_commerce_owner"
  on public.delivery_tracking for insert
  with check (
    public.is_commerce_owner(commerce_id)
    and exists (
      select 1 from public.orders o
      where o.id = delivery_tracking.order_id and o.commerce_id = delivery_tracking.commerce_id
    )
  );
-- Pas de policy update/delete : le journal de tracking est append-only.

-- ratings ---------------------------------------------------------------------
drop policy if exists "ratings_select_involved_or_admin" on public.ratings;
create policy "ratings_select_involved_or_admin"
  on public.ratings for select
  using (
    client_id = auth.uid()
    or (commerce_id is not null and public.is_commerce_owner(commerce_id))
    or public.is_admin()
  );

-- Phase 5 — Module 6 : avis visibles publiquement sur la fiche commerce,
-- avant même de commander (policy en plus de la précédente, pas à la
-- place — Postgres les combine en OR pour un même rôle/commande).
drop policy if exists "ratings_select_public_for_active_commerce" on public.ratings;
create policy "ratings_select_public_for_active_commerce"
  on public.ratings for select
  using (
    commerce_id is not null
    and exists (select 1 from public.commerces c where c.id = ratings.commerce_id and c.is_active)
  );

drop policy if exists "ratings_insert_own_delivered_order" on public.ratings;
create policy "ratings_insert_own_delivered_order"
  on public.ratings for insert
  with check (
    client_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = ratings.order_id and o.client_id = auth.uid() and o.status = 'delivered'
    )
  );

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
-- Storage : bucket delivery-proofs (photo de preuve de livraison)
-- ============================================================================
-- Privé, comme payment-proofs. Convention de chemin : {order_id}/proof.jpg —
-- contrairement à payment-proofs (dossier {user_id}), il faut ici que TROIS
-- acteurs différents (client, commerce, admin) puissent y accéder, d'où la
-- jointure vers orders dans les policies plutôt qu'une simple comparaison
-- de dossier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proofs', 'delivery-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "delivery_proofs_insert_commerce_owner" on storage.objects;
create policy "delivery_proofs_insert_commerce_owner"
  on storage.objects for insert
  with check (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and public.is_commerce_owner(o.commerce_id)
    )
  );

drop policy if exists "delivery_proofs_select_involved_or_admin" on storage.objects;
create policy "delivery_proofs_select_involved_or_admin"
  on storage.objects for select
  using (
    bucket_id = 'delivery-proofs'
    and exists (
      select 1 from public.orders o
      where o.id::text = (storage.foldername(name))[1]
        and (o.client_id = auth.uid() or public.is_commerce_owner(o.commerce_id) or public.is_admin())
    )
  );

-- ============================================================================
-- Storage : bucket prescriptions (ordonnance, Module 7 — pharmacie)
-- ============================================================================
-- Privé. Convention de chemin : {user_id}/{order_id}/prescription.jpg —
-- préfixé par l'auteur (comme payment-proofs) car l'upload a lieu AU
-- CHECKOUT, avant que la ligne orders existe : la policy d'insert ne peut
-- donc pas s'appuyer sur une jointure vers orders, seulement sur
-- auth.uid(). Le deuxième segment (order_id) permet en revanche à la
-- policy de select d'autoriser aussi le commerce concerné, une fois la
-- commande créée.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prescriptions', 'prescriptions', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "prescriptions_insert_own_folder" on storage.objects;
create policy "prescriptions_insert_own_folder"
  on storage.objects for insert
  with check (
    bucket_id = 'prescriptions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "prescriptions_select_involved_or_admin" on storage.objects;
create policy "prescriptions_select_involved_or_admin"
  on storage.objects for select
  using (
    bucket_id = 'prescriptions'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
      or exists (
        select 1 from public.orders o
        where o.id::text = (storage.foldername(name))[2]
          and public.is_commerce_owner(o.commerce_id)
      )
    )
  );

-- ============================================================================
-- Realtime : suivi de commande en direct (Phase 2)
-- ============================================================================
-- Ajoute orders et delivery_tracking à la publication supabase_realtime
-- (déjà créée par défaut sur tout projet Supabase). Les changements ne sont
-- diffusés aux clients abonnés qu'à travers les policies RLS existantes,
-- donc aucune fuite de données au-delà de ce que SELECT autorise déjà.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'delivery_tracking'
  ) then
    alter publication supabase_realtime add table public.delivery_tracking;
  end if;
end $$;

-- ============================================================================
-- Crowd-shipping ("Jibli chay men l'a5er")
-- ============================================================================
-- Marketplace indépendante du système commerces/livraison : un client
-- publie une demande pour qu'on lui ramène un objet de l'étranger, un
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
-- (ce marketplace est réservé aux comptes client, pas commerce/admin).
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
-- fonction SECURITY DEFINER (même principe que is_admin()/is_commerce_owner
-- plus haut), la requête interne s'exécute avec les privilèges du
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
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint platform_settings_singleton check (id)
);

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
  v_proposal_status public.travel_proposal_status;
  v_item_price numeric(10,3);
  v_delivery_fee numeric(10,3);
  v_amount numeric(10,3);
  v_commission numeric(10,3);
  v_commission_rate numeric(5,4);
  v_payment_status public.travel_payment_status;
begin
  if p_payment_method not in ('virement', 'flouci') then
    raise exception 'Méthode de paiement invalide pour le séquestre : % (cash exclu, aucune garde possible).', p_payment_method;
  end if;

  select tp.request_id, tp.status, tr.status, tr.client_id, tp.item_price, tp.delivery_fee
    into v_request_id, v_proposal_status, v_request_status, v_client_id, v_item_price, v_delivery_fee
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

  select status into v_payment_status from public.travel_payments where request_id = p_request_id for update;

  if v_payment_status is null then
    raise exception 'Aucun paiement associé à cette demande.';
  end if;
  if v_payment_status <> 'escrowed' then
    raise exception 'Le paiement doit être "escrowed" pour être libéré (statut actuel : %).', v_payment_status;
  end if;

  perform set_config('jibli.bypass_transition_checks', 'true', true);

  update public.travel_requests set client_confirmed_at = now() where id = p_request_id;
  update public.travel_payments set status = 'released', released_at = now() where request_id = p_request_id;

  perform set_config('jibli.bypass_transition_checks', 'false', true);
end;
$$;

grant execute on function public.confirm_travel_receipt(uuid) to authenticated;

-- ============================================================================
-- Escrow : colonnes ajoutées, travel_payments, withdrawal_requests
-- ============================================================================
alter table public.travel_requests add column if not exists client_confirmed_at timestamptz;

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

-- ============================================================================
-- Vue: admin_client_stats
-- Utilisée par /admin/utilisateurs (liste) pour afficher un nombre de
-- commandes par compte sans requête N+1 ni agrégation côté client.
-- security_invoker = true : la vue s'exécute avec les droits RLS de
-- l'utilisateur qui la consulte (donc soumise à orders_select_involved_or_
-- admin, qui n'autorise que le client concerné, le commerce concerné ou un
-- admin) plutôt qu'avec ceux du créateur de la vue — sans ça, un compte non
-- admin pourrait potentiellement lire les stats de n'importe qui.
-- ============================================================================
create or replace view public.admin_client_stats
with (security_invoker = true) as
select
  p.id as profile_id,
  count(distinct o.id) as orders_count,
  max(o.created_at) as last_order_at
from public.profiles p
left join public.orders o on o.client_id = p.id
where p.role = 'client'
group by p.id;

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
-- Scopé aux missions crowd-shipping pour l'instant, pas aux commandes
-- commerce (domaine séparé). "status" à 2 valeurs suffit pour les 3 filtres
-- de /profil/litiges (Tous = pas de filtre, Ouverts, Résolus). Résolution
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
-- Fin du schéma Phase 0/1/2/3 + Crowd-shipping.
--
-- À faire manuellement dans le dashboard Supabase (non scriptable en SQL) :
--   1. Authentication > Providers > Email : confirmation email activée
--      (comportement par défaut), Site URL + Redirect URLs à renseigner
--      avec le domaine de l'app (ex: http://localhost:3000 en dev, avec
--      /auth/callback autorisé).
--   2. Création des comptes "commerce" : le self-service signup ne crée que
--      des comptes role='client'. Pour donner accès à un commerce, un admin
--      doit : (a) faire passer profiles.role à 'commerce' pour le compte
--      concerné, (b) renseigner commerces.owner_id avec son id. Un flux
--      admin dédié sera construit en Phase 4.
--   3. Pour tester le virement en Phase 2, insérer une ligne dans
--      bank_transfer_info (is_active = true) — la gestion depuis /admin
--      arrive en Phase 4. Idem pour au moins un commerce actif avec un
--      zone_id renseigné (delivery_zones), sinon le checkout refusera la
--      commande faute de zone de livraison configurée.
--   4. Crowd-shipping : rien à faire à la main, le bucket
--      travel-request-photos est créé par ce script comme payment-proofs.
--   5. Escrow : renseigner bank_transfer_info.flouci_phone (numéro Flouci de
--      la plateforme) pour que l'option Flouci soit utilisable au paiement.
--      Renseigner FLOUCI_APP_TOKEN / FLOUCI_APP_SECRET dans .env.local
--      (Flouci dashboard) — sans ça, l'option Flouci reste visible mais
--      désactivée avec un message clair. Le premier compte admin doit être
--      créé manuellement (update profiles set role='admin' where id=...)
--      pour pouvoir accéder à /admin/jibli-paiements (validation virement).
-- ==========================================================================