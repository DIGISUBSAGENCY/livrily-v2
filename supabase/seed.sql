-- ============================================================================
-- Livrily — Données de test (demandes de voyage crowd-shipping)
-- ============================================================================
-- À exécuter dans le SQL Editor de Supabase, APRÈS schema.sql.
--
-- Sûr à ré-exécuter : la section commence par supprimer les lignes qu'elle
-- a elle-même créées (identifiées par des UUID fixes ci-dessous), puis les
-- réinsère. Aucun impact sur des données réelles créées ailleurs (comptes,
-- demandes...).
--
-- Ce fichier contenait aussi le seed du volet commerce (zone de livraison,
-- 6 commerces, catalogue de 78 produits) — retiré avec le rôle commerce
-- (aucune donnée réelle ne dépendait de ces lignes, seed data uniquement).
--
-- Les demandes de voyage (travel_requests) ont besoin d'un client_id réel
-- (contrainte NOT NULL + FK vers profiles) : ce script les rattache
-- automatiquement au premier compte role='client' trouvé. Si aucun compte
-- client n'existe encore, cette section n'insère rien (pas d'erreur) — crée
-- un compte via /signup, laisse-le en rôle 'client' par défaut, puis
-- ré-exécute ce script.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Demandes de voyage (crowd-shipping) — rattachées au premier compte
-- role='client' trouvé. N'insère rien si aucun compte client n'existe
-- encore (cf. en-tête du fichier).
-- ----------------------------------------------------------------------------
delete from public.travel_requests where id in (
  'a0000000-0000-0000-0000-000000000401', 'a0000000-0000-0000-0000-000000000402',
  'a0000000-0000-0000-0000-000000000403', 'a0000000-0000-0000-0000-000000000404',
  'a0000000-0000-0000-0000-000000000405'
);

insert into public.travel_requests
  (id, client_id, item_description, origin_country, destination_city, budget_max, needed_by, status)
select v.id, c.client_id, v.item_description, v.origin_country, v.destination_city, v.budget_max, v.needed_by,
       'open'::public.travel_request_status
from (select id from public.profiles where role = 'client' order by created_at asc limit 1) as c(client_id)
cross join (values
  ('a0000000-0000-0000-0000-000000000401'::uuid, 'iPhone 15 Pro 256 Go, neuf sous blister', 'France', 'Tunis', 1650.000, current_date + 21),
  ('a0000000-0000-0000-0000-000000000402'::uuid, 'Crème La Mer + 2 parfums Chanel', 'France', 'Tunis', 850.000, current_date + 14),
  ('a0000000-0000-0000-0000-000000000403'::uuid, 'Paire de Nike Air Max 90, taille 42', 'Italie', 'Sfax', 320.000, current_date + 30),
  ('a0000000-0000-0000-0000-000000000404'::uuid, 'Whey protein 2kg + multivitamines', 'Allemagne', 'Ariana', 280.000, current_date + 20),
  ('a0000000-0000-0000-0000-000000000405'::uuid, 'Montre connectée Apple Watch Series 9', 'Émirats arabes unis', 'Sousse', 1200.000, current_date + 15)
) as v(id, item_description, origin_country, destination_city, budget_max, needed_by);

commit;

-- ----------------------------------------------------------------------------
-- Vérification rapide (à lancer séparément si besoin) :
--   select item_description, origin_country, destination_city, status from travel_requests order by created_at desc limit 10;
-- ----------------------------------------------------------------------------
