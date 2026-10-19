// Home-size presets (item English name -> qty) used to pre-fill the movers inventory.
export const SIZES = ['studio', '1', '2', '3', '4'] as const;
export type Size = (typeof SIZES)[number];

const base = { Mattress: 1, 'Gas Stove': 1, Refrigerator: 1, Suitcase: 2 };
export const SIZE_PRESET: Record<Size, Record<string, number>> = {
  studio: { ...base, 'Single Bed': 1, 'Carton Box (small)': 5 },
  '1': { ...base, 'Double Bed': 1, 'Sofa (2-seater)': 1, 'TV (up to 50")': 1, 'Wardrobe (2-door)': 1, 'Carton Box (small)': 8, 'Carton Box (large)': 2 },
  '2': { ...base, Mattress: 2, 'Double Bed': 1, 'Single Bed': 1, 'Sofa (3-seater)': 1, 'TV (up to 50")': 1, 'TV Stand': 1, 'Wardrobe (2-door)': 2, 'Washing Machine': 1, 'Dining Table': 1, 'Carton Box (small)': 10, 'Carton Box (large)': 4 },
  '3': { ...base, Mattress: 3, 'Double Bed': 2, 'Single Bed': 1, 'Sofa (3-seater)': 1, 'Coffee Table': 1, 'TV (up to 50")': 1, 'TV Stand': 1, 'Wardrobe (3-door)': 2, Dresser: 1, 'Washing Machine': 1, 'Dining Table': 1, Bookshelf: 1, 'Carton Box (small)': 14, 'Carton Box (large)': 6 },
  '4': { ...base, Mattress: 4, 'Double Bed': 2, 'Single Bed': 2, 'Sofa (3-seater)': 1, 'Sofa (2-seater)': 1, 'Coffee Table': 1, 'TV (up to 50")': 2, 'TV Stand': 1, 'Wardrobe (3-door)': 3, Dresser: 2, 'Washing Machine': 1, 'Dining Table': 1, Bookshelf: 2, Microwave: 1, 'Carton Box (small)': 18, 'Carton Box (large)': 8 },
};

export const nextDays = (n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() + i + 1); d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
});
