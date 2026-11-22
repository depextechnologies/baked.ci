import React from 'react';

import { MODULES, type ModuleCode } from '@/lib/modules';
import { ModuleLogo } from './ModuleLogo';

export const brandName = (code: ModuleCode) => `b${MODULES[code].label}`;

// Back-compat wrapper: `size` is the old font size; renders the official ModuleLogo.
export function BrandName({ code, size = 22, dim = false }: { code: ModuleCode; size?: number; dim?: boolean }) {
  return <ModuleLogo module={code} size={Math.round(size * 1.15)} dim={dim} />;
}
