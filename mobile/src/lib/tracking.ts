import type { Pt } from '@/components/commerce/TrackMap';

export type Step = { code: string; done: boolean; at?: string | null };
export type Tracking = {
  number: string; status: string; currency: string; total: number; fee: number;
  steps: Step[]; terminal: boolean; cancelled: boolean; delivered: boolean; canCancel: boolean; rated: boolean;
  etaMin?: number | null; pickupPin?: string | null;
  driver: { name: string; photo?: string; vehicle?: string; plate?: string; rating?: number } | null;
  geo: { origin: Pt; destination: Pt; driver: Pt };
  items: { name: string; quantity: number; total: number; extra?: string }[];
  raw: any;
};

const CANCELLED = ['cancelled', 'canceled', 'rejected', 'refunded', 'failed'];
const DELIVERED = ['delivered', 'completed'];
const FOOD_DELIVERY = ['placed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
const FOOD_PICKUP = ['placed', 'accepted', 'preparing', 'ready', 'collected'];

function martTracking(raw: any): Tracking {
  const o = raw.order;
  const cancelled = CANCELLED.includes(o.status);
  const delivered = DELIVERED.includes(o.status) || raw.stage === 'delivered';
  return {
    number: o.number, status: o.status, currency: o.currency, total: Number(o.total), fee: Number(o.delivery_fee || 0),
    steps: (raw.timeline || []).map((s: any) => ({ code: s.code, done: !!s.completed, at: s.at })),
    terminal: cancelled || delivered, cancelled, delivered, canCancel: ['pending', 'confirmed'].includes(o.status), rated: o.rating != null,
    etaMin: raw.eta_seconds ? Math.max(1, Math.round(raw.eta_seconds / 60)) : null,
    driver: raw.driver ? { name: raw.driver.name, photo: raw.driver.photo, vehicle: raw.driver.vehicle, plate: raw.driver.vehicle_reg, rating: raw.driver.rating } : null,
    geo: { origin: raw.geo?.store, destination: raw.geo?.destination, driver: raw.geo?.driver },
    items: (o.items || []).map((i: any) => ({ name: i.name, quantity: i.quantity, total: Number(i.line_total) })),
    raw: o,
  };
}

function foodTracking(raw: any): Tracking {
  const o = raw.order; const d = raw.delivery;
  const pickup = o.order_type === 'pickup';
  const flow = pickup ? FOOD_PICKUP : FOOD_DELIVERY;
  const cancelled = CANCELLED.includes(o.status);
  const delivered = DELIVERED.includes(o.status);
  const current = delivered ? flow.length - 1 : Math.max(0, flow.indexOf(o.status));
  const at = (code: string) => (o.events || []).find((e: any) => e.type === code || e.to_status === code)?.at
    || ({ placed: o.placed_at, accepted: o.accepted_at, ready: o.ready_at, delivered: o.delivered_at, collected: o.delivered_at } as any)[code];
  const hasDriver = !!d?.driver?.name;
  return {
    number: o.order_number, status: o.status, currency: o.currency, total: Number(o.grand_total), fee: Number(o.delivery_fee || 0),
    steps: flow.map((code, i) => ({ code, done: !cancelled && i <= current, at: i <= current ? at(code) : null })),
    terminal: cancelled || delivered, cancelled, delivered, canCancel: o.status === 'placed', rated: false,
    pickupPin: null,
    driver: hasDriver ? { name: d.driver.name, photo: d.driver.photo_url, vehicle: d.driver.vehicle, plate: d.driver.plate, rating: d.driver.rating } : null,
    geo: { origin: d?.pickup, destination: d?.drop || (o.delivery_address ? { lat: o.delivery_address.lat, lng: o.delivery_address.lng } : null), driver: d?.driver_location },
    items: (o.items || []).map((i: any) => ({
      name: i.name, quantity: i.quantity, total: Number(i.line_total),
      extra: [i.variant?.name, ...(i.addons || []).map((a: any) => a.name), i.notes].filter(Boolean).join(' · '),
    })),
    raw: o,
  };
}

const SHOP_FLOW = ['pending', 'confirmed', 'shipped', 'delivered'];
function shopTracking(o: any): Tracking {
  const cancelled = CANCELLED.includes(o.status);
  const delivered = DELIVERED.includes(o.status);
  const cur = Math.max(0, SHOP_FLOW.indexOf(o.status));
  return {
    number: o.order_number || o.number, status: o.status, currency: o.currency, total: Number(o.total ?? o.grand_total ?? 0), fee: Number(o.shipping_fee || o.delivery_fee || 0),
    steps: SHOP_FLOW.map((code, i) => ({ code, done: !cancelled && (delivered || i <= cur) })),
    terminal: cancelled || delivered, cancelled, delivered, canCancel: false, rated: true, driver: null,
    geo: { origin: null, destination: null, driver: null },
    items: (o.items || o.lines || []).map((i: any) => ({ name: i.product_title_fr || i.title_fr || i.product_title || i.title || i.name, quantity: i.quantity, total: Number(i.line_total || 0) })),
    raw: o,
  };
}

export const normaliseTracking = (module: 'mart' | 'food' | 'shop', raw: any) =>
  (module === 'mart' ? martTracking(raw) : module === 'shop' ? shopTracking(raw) : foodTracking(raw));
