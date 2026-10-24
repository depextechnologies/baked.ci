export type ModuleCode = 'mart' | 'food' | 'shop' | 'express' | 'auto' | 'immo';
export type ActiveContext = 'baked' | ModuleCode;

export type ModuleDef = {
  code: ModuleCode;
  label: string;
  color: string;
  status: 'active' | 'coming_soon';
  image: number;
  icon: 'basket' | 'utensils' | 'bag' | 'truck' | 'car' | 'home';
};

// `express` is the internal backend code; the customer-facing brand is SEND.
export const MODULES: Record<ModuleCode, ModuleDef> = {
  express: { code: 'express', label: 'SEND', color: '#F5A524', status: 'active', image: require('../../assets/images/modules/tile_send.webp'), icon: 'truck' },
  food: { code: 'food', label: 'FOOD', color: '#77BC1F', status: 'active', image: require('../../assets/images/modules/tile_food.webp'), icon: 'utensils' },
  mart: { code: 'mart', label: 'MART', color: '#77BC1F', status: 'active', image: require('../../assets/images/modules/tile_mart.webp'), icon: 'basket' },
  shop: { code: 'shop', label: 'SHOP', color: '#FCC44C', status: 'active', image: require('../../assets/images/modules/tile_shop.webp'), icon: 'bag' },
  immo: { code: 'immo', label: 'IMMO', color: '#A659FF', status: 'coming_soon', image: require('../../assets/images/modules/tile_immo.webp'), icon: 'home' },
  auto: { code: 'auto', label: 'AUTO', color: '#FF4C52', status: 'coming_soon', image: require('../../assets/images/modules/tile_auto.webp'), icon: 'car' },
};

export const HOME_GRID_ORDER: ModuleCode[] = ['express', 'food', 'mart', 'shop', 'immo', 'auto'];
export const SWITCHER_ORDER: ModuleCode[] = ['mart', 'food', 'shop', 'express', 'auto', 'immo'];

export const isActiveModule = (code: string): code is ModuleCode =>
  code in MODULES && MODULES[code as ModuleCode].status === 'active';
