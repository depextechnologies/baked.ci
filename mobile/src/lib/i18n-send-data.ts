import type { Lang } from './i18n';

// FR labels for SEND catalogue rows the backend only stores in English (keyed by code or English name).
const FR: Record<string, string> = {
  documents: 'Documents', food: 'Colis alimentaire', electronics: 'Électronique', fragile: 'Objets fragiles', furniture: 'Meubles', general: 'Colis standard',
  call_before: 'Appeler le destinataire avant', leave_at_door: 'Laisser devant la porte', signature: 'Signature requise',
  house: 'Déménagement maison', office: 'Bureau', mini_labour: 'Mini-camion + porteurs', single_item: 'Objet unique',
  living_room: 'Salon', bedroom: 'Chambre', kitchen: 'Cuisine', outdoor: 'Extérieur', others: 'Autres',
  early_morning: 'Tôt le matin', late_morning: 'Fin de matinée', afternoon: 'Après-midi', evening: 'Soirée',
  'House Shifting': 'Déménagement maison', 'Office Relocation': 'Déménagement de bureau',
  'Move your home safely and easily': 'Déménagez votre maison en toute sérénité', 'Relocate your office with zero hassle': 'Transférez vos bureaux sans tracas',
  'Small moves with truck and professional movers': 'Petits déménagements avec camion et porteurs', 'Move single items like furniture & appliances': 'Un meuble ou un appareil à déplacer',
  'BEST PRICE': 'MEILLEUR PRIX',
  'Sofa (2-seater)': 'Canapé (2 places)', 'Sofa (3-seater)': 'Canapé (3 places)', 'Single Bed': 'Lit simple', 'Double Bed': 'Lit double', Refrigerator: 'Réfrigérateur',
  'Office Desk': 'Bureau de travail', Bicycle: 'Vélo', 'Carton Box (small)': 'Carton (petit)', 'Carton Box (large)': 'Carton (grand)', 'Plants (large pot)': 'Plantes (grand pot)',
  'Office Chair': 'Chaise de bureau', 'Washing Machine': 'Machine à laver', 'TV (up to 50")': 'Télévision (jusqu’à 50")', 'Wardrobe (2-door)': 'Armoire (2 portes)',
  'Wardrobe (3-door)': 'Armoire (3 portes)', Microwave: 'Micro-ondes', Suitcase: 'Valise', 'Filing Cabinet': 'Classeur', 'TV Stand': 'Meuble TV',
  'Computer/Monitor': 'Ordinateur / écran', 'Gas Stove': 'Cuisinière à gaz', 'Dining Table': 'Table à manger', Mattress: 'Matelas', 'Utensils Box': 'Carton d’ustensiles',
  'Coffee Table': 'Table basse', Dresser: 'Commode', Bookshelf: 'Bibliothèque',
};

const slot12 = (s: string) => s.replace(/(\d{1,2}):(\d{2})\s*(AM|PM)/g, (_, h, m, ap) => `${(Number(h) % 12) + (ap === 'PM' ? 12 : 0)}h${m === '00' ? '' : m}`);

export const sendLabel = (lang: Lang, code?: string | null, fallback?: string | null) =>
  (lang === 'fr' && ((code && FR[code]) || (fallback && FR[fallback]))) || fallback || code || '';

export const slotWindow = (lang: Lang, w?: string | null) => (w && lang === 'fr' ? slot12(w) : w || '');
