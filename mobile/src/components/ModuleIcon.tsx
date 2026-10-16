import { Car, House, ShoppingBag, ShoppingBasket, Truck, Utensils } from 'lucide-react-native';
import React from 'react';

import type { ModuleDef } from '@/lib/modules';

const MAP = { basket: ShoppingBasket, utensils: Utensils, bag: ShoppingBag, truck: Truck, car: Car, home: House };

export function ModuleIcon({ icon, color, size = 22 }: { icon: ModuleDef['icon']; color: string; size?: number }) {
  const Icon = MAP[icon];
  return <Icon color={color} size={size} strokeWidth={2} />;
}
