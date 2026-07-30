import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AdminProvider } from "@/contexts/AdminContext";
import { Toaster } from "@/components/ui/sonner";
import { CustomerApp } from "@/apps/customer/CustomerApp";
import { AdminApp } from "@/apps/admin/AdminApp";
import { PartnerLandingApp } from "@/apps/partner-landing/PartnerLandingApp";

/**
 * App.js — thin dispatcher (Phase 1a v2.0 monorepo refactor).
 *
 * Per Fixing_Prompt.docx v2.0, the source of truth for each independently-
 * deployable frontend now lives under `src/apps/*`:
 *   /admin/*    → apps/admin/AdminApp        (production: admin.baked.ci)
 *   /partner/*  → apps/partner-landing/*     (production: partner.baked.ci)
 *   /*          → apps/customer/CustomerApp  (production: baked.ci)
 *
 * This file's only job is to pick the correct app based on the top-level
 * path prefix (Option A path-based routing until DNS is live).
 */
const App = () => (
  <BrowserRouter>
    <AdminProvider>
      <Routes>
        <Route path="/admin/*" element={<AdminApp />} />
        <Route path="/partner/*" element={<PartnerLandingApp />} />
        <Route path="/*" element={<CustomerApp />} />
      </Routes>
      <Toaster position="top-right" theme="dark" />
    </AdminProvider>
  </BrowserRouter>
);

export default App;
