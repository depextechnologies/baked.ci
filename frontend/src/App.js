import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AdminProvider } from "@/contexts/AdminContext";
import { Toaster } from "@/components/ui/sonner";
import { CustomerApp } from "@/apps/customer/CustomerApp";
import { AdminApp } from "@/apps/admin/AdminApp";
import { PartnerLandingApp } from "@/apps/partner-landing/PartnerLandingApp";
import { PartnerHubApp } from "@/apps/partner-hub/PartnerHubApp";
import { PartnerPortalApp } from "@/apps/partner-portal/PartnerPortalApp";

/**
 * App.js — thin dispatcher (Phase 1a v2.0 monorepo refactor).
 *
 * Per Fixing_Prompt.docx v2.0, the source of truth for each independently-
 * deployable frontend now lives under `src/apps/*`:
 *   /admin/*         → apps/admin/AdminApp        (production: admin.baked.ci)
 *   /partner/*       → apps/partner-hub/*         (production: partner.baked.ci)
 *   /Sell-on-baked/* → apps/partner-landing/*     (production: sell.baked.ci)
 *   /*               → apps/customer/CustomerApp  (production: baked.ci)
 *
 * `GoogleOAuthProvider` wraps every app so any dialog (customer login,
 * partner sign-in, admin) can invoke `<GoogleLogin>` without prop-drilling.
 */
const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

const App = () => (
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <BrowserRouter>
      <AdminProvider>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="/partner-portal/*" element={<PartnerPortalApp />} />
          <Route path="/partner/*" element={<PartnerHubApp />} />
          <Route path="/Sell-on-baked/*" element={<PartnerLandingApp />} />
          <Route path="/*" element={<CustomerApp />} />
        </Routes>
        <Toaster position="top-right" theme="dark" />
      </AdminProvider>
    </BrowserRouter>
  </GoogleOAuthProvider>
);

export default App;
