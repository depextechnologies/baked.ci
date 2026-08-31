"""SHOPbakēd — Slice 2 canonical category tree.

Source: Categories_In_French.docx (authoritative — clean labels, correct accents)
paired with the corresponding English document. Where the raw English doc
had mistranslations / OCR bleed-through, we substituted a clean human label
so sellers on the English locale see accurate copy.

Data shape:
    CATEGORIES: list of (slug, name_fr, name_en, [subcategory tuples])
    Each subcategory tuple: (slug, name_fr, name_en)

Slugs are stable, ASCII, hyphen-separated — the seed uses them as the
idempotency key. Do NOT rename existing slugs; add new rows below.
"""
from __future__ import annotations
import re
import unicodedata


def slugify(text: str) -> str:
    """Deterministic ASCII slug: lower, strip accents, replace non-alnum with '-'."""
    if text is None:
        return ""
    norm = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    norm = norm.lower().strip()
    norm = re.sub(r"[^a-z0-9]+", "-", norm).strip("-")
    return norm


# Ordered — this is the display order sellers/customers see on SHOP.
CATEGORIES: list[tuple[str, str, str, list[tuple[str, str, str]]]] = [
    # 1. Mode Femme
    ("mode-femme", "Mode Femme", "Women's Fashion", [
        ("robes-femme", "Robes femmes", "Women's Dresses"),
        ("jupes-femme", "Jupes femme", "Women's Skirts"),
        ("mode-contemporaine-femme", "Mode contemporaine femme", "Contemporary Women's Fashion"),
        ("mode-vintage-femme", "Mode vintage femme", "Vintage Women's Fashion"),
        ("ensembles-combinaisons-femme", "Ensembles & Combinaisons femme", "Women's Sets & Jumpsuits"),
        ("streetwear-femme", "Streetwear femme", "Women's Streetwear"),
        ("grandes-tailles-femme", "Grandes tailles femme", "Women's Plus Sizes"),
        ("lingerie-femme", "Lingerie femme", "Women's Lingerie"),
        ("boutique-femme", "Boutique femme", "Women's Boutique"),
        ("robes-soiree-femme", "Robes de soirée femme", "Women's Evening Dresses"),
        ("chaussettes-collants-femme", "Chaussettes & Collants femme", "Women's Socks & Tights"),
        ("accessoires-mode-femme", "Accessoires de mode femme", "Women's Fashion Accessories"),
    ]),
    # 2. Mode Homme
    ("mode-homme", "Mode Homme", "Men's Fashion", [
        ("chemises-homme", "Chemises homme", "Men's Shirts"),
        ("costumes-manteaux-homme", "Costumes & Manteaux homme", "Men's Suits & Coats"),
        ("vetements-travail", "Vêtements de travail", "Workwear"),
        ("ensembles-homme", "Ensembles homme", "Men's Sets"),
        ("mode-vintage-homme", "Mode vintage homme", "Vintage Men's Fashion"),
        ("mode-moderne-homme", "Mode moderne Homme", "Modern Men's Fashion"),
        ("streetwear-homme", "Streetwear homme", "Men's Streetwear"),
        ("sous-vetements-homme", "Sous-vêtements homme", "Men's Underwear"),
        ("boutique-homme", "Boutique homme", "Men's Boutique"),
        ("accessoires-mode-homme", "Accessoires de mode homme", "Men's Fashion Accessories"),
    ]),
    # 3. Bébé & Enfant
    ("bebe-enfant", "Bébé & Enfant", "Baby & Kids", [
        ("mode-bebe", "Mode bébé", "Baby Fashion"),
        ("mode-enfant-fille", "Mode enfant fille", "Girls' Fashion"),
        ("mode-enfant-garcon", "Mode enfant garçon", "Boys' Fashion"),
        ("chaussures-bebe", "Chaussures bébé", "Baby Shoes"),
        ("chaussures-fille", "Chaussures pour Fille", "Girls' Shoes"),
        ("chaussures-garcon", "Chaussures pour Garçon", "Boys' Shoes"),
        ("accessoires-bebe-enfant", "Accessoires pour bébé et enfant", "Baby & Kids Accessories"),
        ("vetements-sport-enfant", "Vêtements de sport enfant", "Kids' Sportswear"),
        ("chaussures-sport-enfant", "Chaussures de sport enfant", "Kids' Sports Shoes"),
        ("articles-sport-enfant", "Articles de sport enfant", "Kids' Sports Gear"),
        ("jeux-jouets-enfant", "Jeux & Jouets pour enfant", "Kids' Games & Toys"),
    ]),
    # 4. Chaussures & Sneakers
    ("chaussures-sneakers", "Chaussures & Sneakers", "Shoes & Sneakers", [
        ("sneakers", "Sneakers", "Sneakers"),
        ("chaussures-femme", "Chaussures femme", "Women's Shoes"),
        ("chaussures-homme", "Chaussures homme", "Men's Shoes"),
        ("baskets-femme", "Baskets pour femme", "Women's Trainers"),
        ("talons-chaussures-mariee", "Talons & Chaussures de mariée", "Heels & Bridal Shoes"),
        ("chaussures-ville-homme", "Chaussures de ville pour Homme", "Men's Dress Shoes"),
        ("sandales-chaussons-femme", "Sandales & Chaussons femme", "Women's Sandals & Slippers"),
        ("sandales-claquettes-homme", "Sandales & Claquettes homme", "Men's Sandals & Sliders"),
        ("chaussettes", "Chaussettes", "Socks"),
    ]),
    # 5. Sacs & Bagages
    ("sacs-bagages", "Sacs & Bagages", "Bags & Luggage", [
        ("sacs-main-femme", "Sacs à main femme", "Women's Handbags"),
        ("pochettes-sacs-soiree", "Pochettes & Sacs de soirée", "Clutches & Evening Bags"),
        ("sacs-bandouliere", "Sacs bandoulière", "Shoulder Bags"),
        ("sacs-ordinateur", "Sacs ordinateur", "Laptop Bags"),
        ("sacs-dos", "Sacs à dos", "Backpacks"),
        ("portefeuilles-sacs-homme", "Portefeuilles & Sacs homme", "Men's Wallets & Bags"),
        ("sacs-voyage-valises", "Sacs de voyage & Valises", "Travel Bags & Suitcases"),
        ("maroquinerie-scolaire", "Maroquinerie scolaire", "School Leather Goods"),
        ("etuis-portable", "Etuis portable", "Phone Cases"),
    ]),
    # 6. Bijoux, Montres & Lunettes
    ("bijoux-montres-lunettes", "Bijoux, Montres & Lunettes", "Jewellery, Watches & Eyewear", [
        ("bague-alliance", "Bague & Alliance", "Rings & Wedding Bands"),
        ("bijouterie-femme", "Bijouterie femme", "Women's Jewellery"),
        ("perles-bijoux-femme", "Perles & Bijoux pour Femme", "Women's Pearls & Jewellery"),
        ("bracelet-montres-femme", "Bracelet & Montres femme", "Women's Bracelets & Watches"),
        ("bijouterie-homme", "Bijouterie homme", "Men's Jewellery"),
        ("montres-homme", "Montres pour Homme", "Men's Watches"),
        ("montres-connectees", "Montres connectées", "Smart Watches"),
        ("lunettes-homme", "Lunettes homme", "Men's Eyewear"),
        ("lunettes-femme", "Lunettes pour Femme", "Women's Eyewear"),
    ]),
    # 7. Sports & Loisirs
    ("sports-loisirs", "Sports & Loisirs", "Sports & Leisure", [
        ("equipe-nationale", "Équipe Nationale", "National Team"),
        ("vetements-sport-homme", "Vêtements de sport homme", "Men's Sportswear"),
        ("vetements-sport-femme", "Vêtements de sport femme", "Women's Sportswear"),
        ("boutique-maillots", "Boutique de Maillots", "Jerseys Boutique"),
        ("chaussures-sport-femme", "Chaussures de sport femme", "Women's Sports Shoes"),
        ("chaussures-sport-homme", "Chaussures de sport homme", "Men's Sports Shoes"),
        ("chaussettes-sport", "Chaussettes de sport", "Sports Socks"),
        ("sacs-sport", "Sacs de sport", "Sports Bags"),
        ("accessoires-sport", "Accessoires de sport", "Sports Accessories"),
        ("equipements-sportifs", "Équipements sportifs", "Sports Equipment"),
    ]),
    # 8. Textile & Mercerie
    ("textile-mercerie", "Textile & Mercerie", "Fabric & Haberdashery", [
        ("pagne-wax", "Pagne Wax", "Wax Fabric"),
        ("pagne-tisse", "Pagne Tissé", "Woven Fabric"),
        ("super-wax", "Super-Wax", "Super-Wax"),
        ("pagne-teinte-adire", "Pagne teinté & Adire", "Dyed Fabric & Adire"),
        ("soie", "Soie", "Silk"),
        ("dentelle", "Dentelle", "Lace"),
        ("bazin", "Bazin", "Bazin"),
        ("tissus-habillement", "Tissus d'Habillement", "Apparel Fabrics"),
        ("tissus-ameublement", "Tissus d'Ameublement", "Upholstery Fabrics"),
        ("mercerie", "Mercerie", "Haberdashery"),
    ]),
    # 9. Librairie & Papeterie
    ("librairie-papeterie", "Librairie & Papeterie", "Books & Stationery", [
        ("livres-scolaires", "Livres scolaires", "School Books"),
        ("beaux-livres", "Beaux livres", "Coffee-table Books"),
        ("livres-enfants", "Livres pour enfants", "Children's Books"),
        ("dictionnaires-langues", "Dictionnaires & Langues", "Dictionaries & Languages"),
        ("livres-religions-spiritualites", "Livres Religions & Spiritualités", "Religion & Spirituality Books"),
        ("autres-livres", "Autres livres", "Other Books"),
        ("fournitures-bureau", "Fournitures de bureau", "Office Supplies"),
        ("fournitures-scolaires", "Fournitures scolaires", "School Supplies"),
        ("cahiers-copies", "Cahiers & copies", "Notebooks & Paper"),
        ("musique-cd-k7-dvd", "Musique, CD, K7 & DVD", "Music, CDs, Tapes & DVDs"),
    ]),
    # 10. Jeux vidéo & Consoles
    ("jeux-video-consoles", "Jeux vidéo & Consoles", "Video Games & Consoles", [
        ("jeux-video", "Jeux Vidéo", "Video Games"),
        ("playstation", "PlayStation", "PlayStation"),
        ("nintendo", "Nintendo", "Nintendo"),
        ("xbox", "Xbox", "Xbox"),
        ("univers-gaming", "Univers Gaming", "Gaming World"),
        ("realite-virtuelle", "Réalité virtuelle", "Virtual Reality"),
        ("retrogaming", "Rétrogaming", "Retrogaming"),
    ]),
    # 11. Apple
    ("apple", "Apple", "Apple", [
        ("iphone", "iPhone", "iPhone"),
        ("ipad", "iPad", "iPad"),
        ("mac", "Mac", "Mac"),
        ("apple-tv", "Apple TV", "Apple TV"),
        ("apple-watch", "Apple Watch", "Apple Watch"),
        ("airtag", "AirTag", "AirTag"),
        ("accessoires-apple", "Accessoires Apple", "Apple Accessories"),
        ("airpods-earpods", "AirPods & EarPods", "AirPods & EarPods"),
        ("beats", "Beats", "Beats"),
        ("itunes", "iTunes", "iTunes"),
    ]),
    # 12. Smartphones & Téléphones
    ("smartphones-telephones", "Smartphones & Téléphones", "Smartphones & Phones", [
        ("smartphones", "Smartphones", "Smartphones"),
        ("tablettes", "Tablettes", "Tablets"),
        ("telephone-portable-fixe", "Téléphone portable & Fixe", "Mobile & Landline Phones"),
        ("smartphone-gamer", "Smartphone gamer", "Gaming Smartphones"),
        ("coques-etuis-housses", "Coques, Etuis et Housses", "Cases, Covers & Sleeves"),
        ("etanches-antichoc", "Les étanches et antichoc", "Waterproof & Shockproof Cases"),
        ("accessoires-telephone", "Accessoires téléphone", "Phone Accessories"),
        ("ecouteurs-casques", "Écouteurs & casques", "Earphones & Headphones"),
    ]),
    # 13. TV, Son & Photo
    ("tv-son-photo", "TV, Son & Photo", "TV, Sound & Photo", [
        ("televisions", "Télévisions", "Televisions"),
        ("haut-parleurs-home-cinema", "Haut-parleurs & Home Cinéma", "Speakers & Home Cinema"),
        ("videoprojecteurs", "Vidéoprojecteurs", "Video Projectors"),
        ("photo-camera", "Photo & Caméra", "Photo & Camera"),
        ("accessoires-camera", "Accessoires de caméra", "Camera Accessories"),
        ("drones", "Drones", "Drones"),
        ("sono-dj-instruments-musique", "Sono DJ & Instruments de Musiques", "DJ Sound & Musical Instruments"),
        ("telecommandes", "Télécommandes", "Remote Controls"),
        ("microphones", "Microphones", "Microphones"),
    ]),
    # 14. Electroménager
    ("electromenager", "Electroménager", "Home Appliances", [
        ("cuisiniere-gaziniere", "Cuisinière & Gazinière", "Cookers & Stoves"),
        ("micro-ondes", "Micro-ondes", "Microwaves"),
        ("machine-a-laver", "Machine à laver", "Washing Machines"),
        ("cave-a-vin", "Cave à vin", "Wine Cellars"),
        ("congelateur-refrigerateur", "Congélateur & Réfrigérateur", "Freezers & Fridges"),
        ("climatiseur", "Climatiseur", "Air Conditioners"),
        ("multicuiseur-barbecue", "Multicuiseur & Barbecue", "Multicookers & Barbecues"),
        ("mixeur-batteur", "Mixeur & Batteur", "Blenders & Mixers"),
        ("aspirateur", "Aspirateur", "Vacuum Cleaners"),
        ("fer-a-repasser", "Fer à repasser", "Irons"),
    ]),
    # 15. Informatique & Bureau
    ("informatique-bureau", "Informatique & Bureau", "Computing & Office", [
        ("chromebook", "Chromebook", "Chromebook"),
        ("pc-portable", "PC portable", "Laptops"),
        ("ordinateur-bureau", "Ordinateur de bureau", "Desktop Computers"),
        ("imprimantes", "Imprimantes", "Printers"),
        ("scanners", "Scanners", "Scanners"),
        ("sacs-coques-info", "Sacs & coques", "Bags & Cases"),
        ("accessoires-informatique", "Accessoires informatique", "Computer Accessories"),
        ("peripheriques-stockage", "Périphériques de stockage", "Storage Devices"),
    ]),
    # 16. Meuble & Décoration
    ("meuble-decoration", "Meuble & Décoration", "Furniture & Décor", [
        ("meubles-salon", "Meubles de salon", "Living Room Furniture"),
        ("meubles-chambre", "Meubles de chambre", "Bedroom Furniture"),
        ("salle-a-manger", "Salle à manger", "Dining Room"),
        ("meubles-bureau", "Meubles de bureau", "Office Furniture"),
        ("meubles-enfant", "Meubles pour enfant", "Kids' Furniture"),
        ("literie-linge", "Literie & Linge", "Bedding & Linen"),
        ("matelas", "Matelas", "Mattresses"),
        ("tableaux-art", "Tableaux d'Art", "Art Paintings"),
        ("objets-decoration", "Objets de décoration", "Decorative Objects"),
        ("ustensiles-cuisine", "Ustensiles de cuisine", "Kitchen Utensils"),
        ("mobilier-jardin", "Mobilier de jardin", "Garden Furniture"),
    ]),
    # 17. Bricolage & Jardin
    ("bricolage-jardin", "Bricolage & Jardin", "DIY & Garden", [
        ("parapluies", "Parapluies", "Umbrellas"),
        ("outils-jardin", "Outils de jardin", "Garden Tools"),
        ("kits-outils", "Kits d'outils", "Tool Kits"),
        ("quincaillerie", "Quincaillerie", "Hardware"),
        ("lumiere-eclairage", "Lumière & Éclairage", "Light & Lighting"),
        ("boutique-bricolage", "Boutique de Bricolage", "DIY Boutique"),
        ("rangement-cuisine", "Rangement de Cuisine", "Kitchen Storage"),
        ("rangement-maison", "Rangement de Maison", "Home Storage"),
        ("surete-securite", "Sûreté & sécurité", "Safety & Security"),
        ("balais", "Balais", "Brooms"),
        ("pouvelles-serpilleres", "Poubelles & Serpillères", "Bins & Mops"),
    ]),
    # 18. Beauté & Bien-être
    ("beaute-bien-etre", "Beauté & Bien-être", "Beauty & Wellness", [
        ("maquillage", "Maquillage", "Makeup"),
        ("soins-peau", "Soins de la peau", "Skincare"),
        ("soins-ongles", "Soins Ongles", "Nail Care"),
        ("eau-cologne", "Eau de Cologne", "Eau de Cologne"),
        ("parfum-deodorant-femme", "Parfum & Déodorant femme", "Women's Perfume & Deodorant"),
        ("parfumerie-homme", "Parfumerie homme", "Men's Perfumery"),
        ("parfumerie-enfant", "Parfumerie enfant", "Kids' Perfumery"),
        ("gel-douche-savon", "Gel douche & Savon", "Shower Gel & Soap"),
        ("gel-rasage-apres-rasage", "Gel rasage et après rasage", "Shaving & Aftershave"),
        ("essentiels-bain-corps", "Essentiels bain et corps", "Bath & Body Essentials"),
        ("produits-capillaires", "Produits capillaires", "Hair Products"),
        ("soins-hommes", "Soins pour hommes", "Men's Care"),
        ("autres-beaute", "Autres articles de beauté", "Other Beauty Items"),
    ]),
    # 19. Automobile
    ("automobile", "Automobile", "Automotive", [
        ("pieces-voiture", "Pièces pour voiture", "Car Parts"),
        ("outils-entretien", "Outils & entretien", "Tools & Maintenance"),
        ("autres-accessoires-auto", "Autres accessoires auto", "Other Auto Accessories"),
        ("pieces-accessoires-moto", "Pièces & accessoires moto", "Motorcycle Parts & Accessories"),
    ]),
]
