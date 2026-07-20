import React from "react";
import { BakedLogo } from "./BakedLogo";

export const Footer = () => (
  <footer className="mt-16 border-t border-border">
    <div className="baked-container py-10 grid gap-8 md:grid-cols-4">
      <div>
        <BakedLogo size="md" />
        <p className="text-xs text-muted-foreground mt-3 max-w-xs">
          One account. All of bak&#275;d. Groceries, food, shopping, delivery, vehicles &amp; property — delivered across C&ocirc;te d&apos;Ivoire and beyond.
        </p>
      </div>
      <div>
        <div className="text-sm font-semibold mb-3">Platform</div>
        <ul className="text-xs text-muted-foreground space-y-2">
          <li>MARTbakēd</li><li>FOODbakēd</li><li>SHOPbakēd</li><li>EXPRESSbakēd</li>
        </ul>
      </div>
      <div>
        <div className="text-sm font-semibold mb-3">Support</div>
        <ul className="text-xs text-muted-foreground space-y-2">
          <li>Help Center</li><li>Contact us</li><li>Terms</li><li>Privacy</li>
        </ul>
      </div>
      <div>
        <div className="text-sm font-semibold mb-3">Available in</div>
        <ul className="text-xs text-muted-foreground space-y-2">
          <li>&#127464;&#127474; C&ocirc;te d&apos;Ivoire</li><li>🇱🇷 Liberia</li><li className="opacity-60">🇸🇳 Senegal — soon</li><li className="opacity-60">🇬🇭 Ghana — soon</li>
        </ul>
      </div>
    </div>
    <div className="border-t border-border/60 py-4 text-center text-[11px] text-muted-foreground">
      © 2026 BAKĒD Platform. Built for Africa, ready for the world.
    </div>
  </footer>
);
