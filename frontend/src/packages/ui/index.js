// Shared UI barrel — Phase 1a placeholder. Re-exports the existing shadcn
// components + BAKĒD-branded pieces so downstream apps can migrate their
// imports to `packages/ui` today and the source of truth can be relocated
// in Phase 1b without another import-touch pass.

export { BakedLogo, BrandedModuleLabel } from "../../components/layout/BakedLogo";
export { Footer } from "../../components/layout/Footer";
export { TopNav } from "../../components/layout/TopNav";
export { ModuleTabs } from "../../components/layout/ModuleTabs";

export { Button } from "../../components/ui/button";
export { Card, CardHeader, CardContent, CardFooter } from "../../components/ui/card";
export { Input } from "../../components/ui/input";
export { toast } from "sonner";
