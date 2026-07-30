/**
 * @packages/ui — shared design-system barrel (Phase 1a).
 *
 * Downstream apps (customer, admin, partner-landing, future per-module
 * partner apps) import BAKĒD-branded primitives and Shadcn components
 * from here. This keeps app code decoupled from the physical location
 * of the source of truth — Phase 1b can relocate the actual files
 * without touching a single import site.
 */

// BAKĒD-branded layout pieces
export { BakedLogo, BrandedModuleLabel } from "../../components/layout/BakedLogo";
export { Footer } from "../../components/layout/Footer";
export { TopNav } from "../../components/layout/TopNav";
export { ModuleTabs } from "../../components/layout/ModuleTabs";

// Shadcn primitives (add more here as apps need them — no code change to app)
export { Button } from "../../components/ui/button";
export { Input } from "../../components/ui/input";
export { Label } from "../../components/ui/label";
export { Textarea } from "../../components/ui/textarea";
export { Badge } from "../../components/ui/badge";
export { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from "../../components/ui/card";
export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "../../components/ui/dialog";
export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetDescription } from "../../components/ui/sheet";
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
export { Separator } from "../../components/ui/separator";
export { Skeleton } from "../../components/ui/skeleton";
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
export { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
export { Switch } from "../../components/ui/switch";

// Notifications — always the shared sonner instance
export { toast } from "sonner";
