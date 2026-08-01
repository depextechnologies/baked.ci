import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AdminProvider } from "@/contexts/AdminContext";
import { Toaster } from "@/components/ui/sonner";
import { CustomerApp } from "@/apps/customer/CustomerApp";
import { AdminApp } from "@/apps/admin/AdminApp";
import { PartnerLandingApp } from "@/apps/partner-landing/PartnerLandingApp";
import { PartnerHubApp } from "@/apps/partner-hub/PartnerHubApp";

/**
 * App.js — thin dispatcher (Phase 1a v2.0 monorepo refactor).
 *
 * Per Fixing_Prompt.docx v2.0, the source of truth for each independently-
 * deployable frontend now lives under `src/apps/*`:
 *   /admin/*         → apps/admin/AdminApp        (production: admin.baked.ci)
 *   /partner/*       → apps/partner-hub/*         (production: partner.baked.ci)
 *   /Sell-on-baked/* → apps/partner-landing/*     (production: sell.baked.ci)
 *   /*               → apps/customer/CustomerApp  (production: baked.ci)
 */
const App = () => (
  <BrowserRouter>
    <AdminProvider>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/partner/*" element={<PartnerHubApp />} />
        <Route path="/Sell-on-baked/*" element={<PartnerLandingApp />} />
        <Route path="/*" element={<CustomerApp />} />
      </Routes>
      <Toaster position="top-right" theme="dark" />
    </AdminProvider>
  </BrowserRouter>
);

export default App;
