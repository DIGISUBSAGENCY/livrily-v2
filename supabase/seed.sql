-- ============================================================================
-- Livrily — Données de test (commerces + catalogue + demandes de voyage)
-- ============================================================================
-- À exécuter dans le SQL Editor de Supabase, APRÈS schema.sql.
--
-- Sûr à ré-exécuter : chaque section commence par supprimer les lignes
-- qu'elle a elle-même créées (identifiées par des UUID fixes ci-dessous),
-- puis les réinsère. Aucun impact sur des données réelles créées ailleurs
-- (comptes, commandes...).
--
-- Les commerces sont créés SANS owner_id (comme le permet le schéma) : ils
-- apparaissent immédiatement dans /commerces et sont commandables, mais
-- n'ont pas encore de compte commerce lié. Pour lier un compte de test :
--   update profiles set role = 'commerce' where id = '<uuid>';
--   update commerces set owner_id = '<uuid>' where id = '<uuid-commerce>';
--
-- Les demandes de voyage (travel_requests) ont besoin d'un client_id réel
-- (contrainte NOT NULL + FK vers profiles) : ce script les rattache
-- automatiquement au premier compte role='client' trouvé. Si aucun compte
-- client n'existe encore, cette section n'insère rien (pas d'erreur) — crée
-- un compte via /signup, laisse-le en rôle 'client' par défaut, puis
-- ré-exécute juste cette dernière section.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) Zone de livraison — Grand Tunis
-- ----------------------------------------------------------------------------
delete from public.delivery_zones where id = 'a0000000-0000-0000-0000-000000000001';

insert into public.delivery_zones
  (id, name, city, center_lat, center_lng, radius_meters, delivery_fee, fee_per_km, min_order_amount, is_active)
values
  ('a0000000-0000-0000-0000-000000000001', 'Grand Tunis', 'Tunis', 36.8400, 10.2100, 15000, 3.000, 0.500, 10.000, true);

-- ----------------------------------------------------------------------------
-- 2) Commerces (les produits sont insérés en cascade depuis leur commerce_id
--    plus bas ; supprimer le commerce suffit à nettoyer aussi son catalogue,
--    products.commerce_id est en "on delete cascade").
-- ----------------------------------------------------------------------------
delete from public.commerces where id in (
  'a0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000102',
  'a0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000202',
  'a0000000-0000-0000-0000-000000000301', 'a0000000-0000-0000-0000-000000000302'
);

insert into public.commerces
  (id, name, category, description, address, lat, lng, zone_id, phone, is_active, is_open)
values
  ('a0000000-0000-0000-0000-000000000101', 'Carrefour Market La Marsa', 'supermarche',
   'Supermarché de quartier : épicerie, produits frais, hygiène et entretien.',
   'Avenue Habib Bourguiba, La Marsa', 36.8781, 10.3247,
   'a0000000-0000-0000-0000-000000000001', '71 774 512', true, true),

  ('a0000000-0000-0000-0000-000000000102', 'Monoprix Lac 2', 'supermarche',
   'Grande surface avec un large choix de produits locaux et importés.',
   'Rue du Lac Léman, Les Berges du Lac 2, Tunis', 36.8395, 10.2317,
   'a0000000-0000-0000-0000-000000000001', '71 861 203', true, true),

  ('a0000000-0000-0000-0000-000000000201', 'Boulangerie El Ferdaous', 'boulangerie',
   'Pain traditionnel et viennoiseries fraîches, cuits sur place chaque matin.',
   'Avenue de la Liberté, Tunis', 36.8033, 10.1656,
   'a0000000-0000-0000-0000-000000000001', '71 345 890', true, true),

  ('a0000000-0000-0000-0000-000000000202', 'Pain Doré Ariana', 'boulangerie',
   'Boulangerie-pâtisserie : pain complet, gâteaux traditionnels et occidentaux.',
   'Avenue Ibn Khaldoun, Ariana', 36.8625, 10.1956,
   'a0000000-0000-0000-0000-000000000001', '71 712 456', true, true),

  ('a0000000-0000-0000-0000-000000000301', 'Marché Frais Bab Souika', 'fruits_legumes',
   'Fruits et légumes de saison, sélectionnés chaque matin au marché de gros.',
   'Rue Bab Souika, Tunis', 36.8033, 10.1656,
   'a0000000-0000-0000-0000-000000000001', '71 567 234', true, true),

  ('a0000000-0000-0000-0000-000000000302', 'Primeur El Menzah', 'fruits_legumes',
   'Primeur de quartier, produits locaux et de saison.',
   'Rue Alain Savary, El Menzah, Tunis', 36.8422, 10.1642,
   'a0000000-0000-0000-0000-000000000001', '71 234 678', true, true);

-- ----------------------------------------------------------------------------
-- 3) Catalogue — Carrefour Market La Marsa (supermarché)
-- ----------------------------------------------------------------------------
insert into public.products (commerce_id, name, description, price, unit, is_available) values
  ('a0000000-0000-0000-0000-000000000101', 'Huile d''olive extra vierge 1L', 'Huile d''olive tunisienne première pression à froid.', 18.500, 'bouteille', true),
  ('a0000000-0000-0000-0000-000000000101', 'Couscous moyen 1kg', 'Semoule de blé dur, grain moyen.', 3.200, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000101', 'Harissa Cap Bon 135g', 'Harissa artisanale, boîte métallique.', 1.800, 'boîte', true),
  ('a0000000-0000-0000-0000-000000000101', 'Lait demi-écrémé 1L', 'Lait UHT demi-écrémé, brique.', 1.450, 'brique', true),
  ('a0000000-0000-0000-0000-000000000101', 'Yaourt nature x4', 'Pack de 4 yaourts natures.', 2.100, 'pack', true),
  ('a0000000-0000-0000-0000-000000000101', 'Pâtes 500g', 'Pâtes courtes type coquillettes.', 1.350, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000101', 'Riz long 1kg', 'Riz long grain.', 2.900, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000101', 'Sucre blanc 1kg', 'Sucre cristallisé.', 1.700, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000101', 'Thé vert 200g', 'Thé vert de Chine, boîte.', 4.500, 'boîte', true),
  ('a0000000-0000-0000-0000-000000000101', 'Café moulu 250g', 'Café torréfié moulu.', 6.800, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000101', 'Eau minérale 1.5L', 'Eau de source, bouteille plastique.', 0.750, 'bouteille', true),
  ('a0000000-0000-0000-0000-000000000101', 'Jus d''orange 1L', 'Jus d''orange à base de concentré.', 3.100, 'brique', true),
  ('a0000000-0000-0000-0000-000000000101', 'Fromage fondu x8', 'Portions individuelles.', 4.200, 'boîte', true),
  ('a0000000-0000-0000-0000-000000000101', 'Œufs x30', 'Plateau de 30 œufs calibre moyen.', 8.500, 'plateau', true),
  ('a0000000-0000-0000-0000-000000000101', 'Poulet entier frais', 'Poulet fermier, vendu au kilo.', 9.900, 'kg', true),
  ('a0000000-0000-0000-0000-000000000101', 'Papier toilette x12', 'Pack de 12 rouleaux double épaisseur.', 7.200, 'pack', true),
  ('a0000000-0000-0000-0000-000000000101', 'Liquide vaisselle 750ml', 'Parfum citron.', 2.400, 'flacon', true),
  ('a0000000-0000-0000-0000-000000000101', 'Lessive poudre 3kg', 'Lessive poudre grand format.', 14.900, 'sac', true);

-- ----------------------------------------------------------------------------
-- 4) Catalogue — Monoprix Lac 2 (supermarché)
-- ----------------------------------------------------------------------------
insert into public.products (commerce_id, name, description, price, unit, is_available) values
  ('a0000000-0000-0000-0000-000000000102', 'Huile d''olive extra vierge 1L', 'Huile d''olive tunisienne première pression à froid.', 19.200, 'bouteille', true),
  ('a0000000-0000-0000-0000-000000000102', 'Couscous fin 1kg', 'Semoule de blé dur, grain fin.', 3.400, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000102', 'Lait entier 1L', 'Lait UHT entier, brique.', 1.550, 'brique', true),
  ('a0000000-0000-0000-0000-000000000102', 'Beurre doux 200g', 'Beurre pasteurisé.', 4.900, 'plaquette', true),
  ('a0000000-0000-0000-0000-000000000102', 'Confiture d''abricot 400g', 'Confiture artisanale.', 3.600, 'pot', true),
  ('a0000000-0000-0000-0000-000000000102', 'Céréales petit-déjeuner 375g', 'Flocons de maïs.', 6.200, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000102', 'Chocolat noir 100g', 'Tablette 70% cacao.', 3.100, 'tablette', true),
  ('a0000000-0000-0000-0000-000000000102', 'Chips nature 150g', 'Chips de pomme de terre.', 2.800, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000102', 'Eau minérale 5L', 'Bidon, eau de source.', 2.100, 'bidon', true),
  ('a0000000-0000-0000-0000-000000000102', 'Jus multifruits 1L', 'Jus à base de concentré, sans sucre ajouté.', 3.300, 'brique', true),
  ('a0000000-0000-0000-0000-000000000102', 'Thon à l''huile x3', 'Boîtes de 160g.', 7.900, 'pack', true),
  ('a0000000-0000-0000-0000-000000000102', 'Sauce tomate 700g', 'Coulis de tomate nature.', 2.200, 'bocal', true),
  ('a0000000-0000-0000-0000-000000000102', 'Farine de blé 1kg', 'Farine tout usage.', 1.900, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000102', 'Shampoing 400ml', 'Cheveux normaux.', 8.500, 'flacon', true),
  ('a0000000-0000-0000-0000-000000000102', 'Dentifrice 75ml', 'Protection complète.', 4.100, 'tube', true),
  ('a0000000-0000-0000-0000-000000000102', 'Sacs poubelle x20', 'Format 50L.', 3.900, 'rouleau', true);

-- ----------------------------------------------------------------------------
-- 5) Catalogue — Boulangerie El Ferdaous
-- ----------------------------------------------------------------------------
insert into public.products (commerce_id, name, description, price, unit, is_available) values
  ('a0000000-0000-0000-0000-000000000201', 'Baguette traditionnelle', 'Cuite au feu de bois.', 0.450, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000201', 'Pain complet', 'Farine complète, sans additifs.', 1.200, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000201', 'Croissant beurre', 'Pur beurre, cuisson du matin.', 0.900, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000201', 'Pain au chocolat', 'Viennoiserie pur beurre.', 1.100, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000201', 'Msemen x5', 'Crêpes feuilletées maison.', 3.500, 'pack', true),
  ('a0000000-0000-0000-0000-000000000201', 'Makroudh aux dattes x6', 'Semoule fourrée aux dattes, miel.', 6.000, 'boîte', true),
  ('a0000000-0000-0000-0000-000000000201', 'Zlabia 250g', 'Pâtisserie tunisienne au miel.', 4.200, 'boîte', true),
  ('a0000000-0000-0000-0000-000000000201', 'Baklawa assortiment 500g', 'Assortiment de pâtisseries orientales.', 12.500, 'boîte', true),
  ('a0000000-0000-0000-0000-000000000201', 'Cake au yaourt', 'Gâteau maison, format familial.', 5.800, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000201', 'Pain de mie complet', 'Tranché, sans conservateurs.', 2.900, 'paquet', true);

-- ----------------------------------------------------------------------------
-- 6) Catalogue — Pain Doré Ariana
-- ----------------------------------------------------------------------------
insert into public.products (commerce_id, name, description, price, unit, is_available) values
  ('a0000000-0000-0000-0000-000000000202', 'Baguette traditionnelle', 'Cuite au feu de bois.', 0.450, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000202', 'Pain grillé (biscotte) 300g', 'Pain de mie grillé, tranché fin.', 3.400, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000202', 'Croissant amande', 'Fourré à la crème d''amande.', 1.600, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000202', 'Mille-feuille', 'Pâte feuilletée, crème pâtissière.', 2.900, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000202', 'Tarte aux fruits (part)', 'Fruits de saison.', 3.200, 'part', true),
  ('a0000000-0000-0000-0000-000000000202', 'Cornes de gazelle x8', 'Pâtisserie tunisienne à la pâte d''amande.', 9.500, 'boîte', true),
  ('a0000000-0000-0000-0000-000000000202', 'Kaak warka x6', 'Biscuits secs traditionnels.', 5.500, 'boîte', true),
  ('a0000000-0000-0000-0000-000000000202', 'Gâteau anniversaire (1kg)', 'Sur commande, génoise et crème au beurre.', 22.000, 'pièce', false),
  ('a0000000-0000-0000-0000-000000000202', 'Pain complet aux graines', 'Graines de tournesol et lin.', 2.100, 'pièce', true);

-- ----------------------------------------------------------------------------
-- 7) Catalogue — Marché Frais Bab Souika
-- ----------------------------------------------------------------------------
insert into public.products (commerce_id, name, description, price, unit, is_available) values
  ('a0000000-0000-0000-0000-000000000301', 'Tomates', 'Tomates fraîches de saison.', 1.800, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Pommes de terre', 'Calibre moyen.', 1.200, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Oignons', 'Oignons jaunes.', 1.100, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Poivrons verts', 'Poivrons frais.', 2.500, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Courgettes', 'Courgettes fraîches.', 1.900, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Carottes', 'Carottes fraîches.', 1.400, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Pommes Golden', 'Pommes locales.', 4.200, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Bananes', 'Bananes importées.', 3.800, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Oranges Maltaise', 'Oranges de saison, sucrées.', 2.600, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Citrons', 'Citrons frais.', 2.900, 'kg', true),
  ('a0000000-0000-0000-0000-000000000301', 'Salade verte', 'Laitue fraîche.', 0.900, 'pièce', true),
  ('a0000000-0000-0000-0000-000000000301', 'Persil / Coriandre', 'Botte fraîche.', 0.500, 'botte', true),
  ('a0000000-0000-0000-0000-000000000301', 'Ail', 'Ail local.', 9.500, 'kg', true);

-- ----------------------------------------------------------------------------
-- 8) Catalogue — Primeur El Menzah
-- ----------------------------------------------------------------------------
insert into public.products (commerce_id, name, description, price, unit, is_available) values
  ('a0000000-0000-0000-0000-000000000302', 'Tomates', 'Tomates fraîches de saison.', 1.900, 'kg', true),
  ('a0000000-0000-0000-0000-000000000302', 'Concombres', 'Concombres frais.', 1.600, 'kg', true),
  ('a0000000-0000-0000-0000-000000000302', 'Aubergines', 'Aubergines fraîches.', 1.700, 'kg', true),
  ('a0000000-0000-0000-0000-000000000302', 'Piments verts', 'Piments doux.', 3.200, 'kg', true),
  ('a0000000-0000-0000-0000-000000000302', 'Melon (saison)', 'Melon jaune local.', 2.400, 'kg', true),
  ('a0000000-0000-0000-0000-000000000302', 'Pastèque (saison)', 'Pastèque locale.', 1.300, 'kg', false),
  ('a0000000-0000-0000-0000-000000000302', 'Raisin blanc', 'Raisin de table.', 5.900, 'kg', true),
  ('a0000000-0000-0000-0000-000000000302', 'Fraises', 'Fraises fraîches de saison.', 6.500, 'kg', true),
  ('a0000000-0000-0000-0000-000000000302', 'Avocats', 'Avocats mûrs à point.', 8.900, 'kg', true),
  ('a0000000-0000-0000-0000-000000000302', 'Dattes Deglet Nour 500g', 'Dattes du Sud tunisien.', 6.800, 'paquet', true),
  ('a0000000-0000-0000-0000-000000000302', 'Menthe fraîche', 'Botte fraîche.', 0.600, 'botte', true),
  ('a0000000-0000-0000-0000-000000000302', 'Pommes de terre', 'Calibre moyen.', 1.250, 'kg', true);

-- ----------------------------------------------------------------------------
-- 9) Demandes de voyage (crowd-shipping) — rattachées au premier compte
--    role='client' trouvé. N'insère rien si aucun compte client n'existe
--    encore (cf. en-tête du fichier).
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
--   select category, count(*) from commerces where zone_id = 'a0000000-0000-0000-0000-000000000001' group by category;
--   select c.name, count(p.*) from commerces c join products p on p.commerce_id = c.id group by c.name;
--   select item_description, origin_country, destination_city, status from travel_requests order by created_at desc limit 10;
-- ----------------------------------------------------------------------------
