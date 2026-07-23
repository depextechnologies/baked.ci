import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Package, Briefcase, Boxes, FileText, Calendar, Plane, Home } from "lucide-react";
import { ExpressHeader } from "../../components/express/ExpressLayout";
import { EXPRESS_ASSETS } from "../../lib/expressAssets";

const YELLOW = "#FCC44C";
const YELLOW_TINT = "#FCC44C22";

/**
 * ExpressServices — Express-only overview of every logistics service.
 * Active tiles navigate into the dedicated booking flow; future tiles show a
 * "Coming soon" badge but stay visible so customers can discover the roadmap.
 */
const SERVICES = [
  { code: "parcel",    title: "Parcel Delivery",     subtitle: "Fast document & parcel delivery",  route: "/express/book/location", image: EXPRESS_ASSETS.parcel,  soon: false },
  { code: "movers",    title: "Packers & Movers",    subtitle: "Full home & office relocation",     route: "/express/movers",         image: EXPRESS_ASSETS.moving,  soon: false },
  { code: "home",      title: "Home Shifting",       subtitle: "Safe & hassle-free house moves",    route: "/express/movers?type=house",         icon: Home,      soon: false },
  { code: "business",  title: "Business Delivery",   subtitle: "Monthly-invoice accounts (save 25%)", route: "/express/book/location",             icon: Briefcase, soon: false },
  { code: "bulk",      title: "Bulk Delivery",       subtitle: "Multi-parcel, wholesale routes",    route: "/express/book/location",             icon: Boxes,     soon: false },
  { code: "document",  title: "Document Delivery",   subtitle: "Contracts, passports, cheques",     route: "/express/book/location",             icon: FileText,  soon: false },
  { code: "scheduled", title: "Scheduled Delivery",  subtitle: "Book for a later date and time",    route: "/express/book/location",             icon: Calendar,  soon: false },
  { code: "airport",   title: "Airport Delivery",    subtitle: "To & from airports",                route: null,                                    icon: Plane,     soon: true  },
];

export const ExpressServices = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-28">
      <ExpressHeader title="Services" onBack={() => navigate("/express")} />

      <div className="px-4 pt-3">
        <div className="text-xs text-white/60">All EXPRESSbakēd logistics services in one place</div>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-3">
        {SERVICES.map((s) => (
          <button
            key={s.code}
            data-testid={`exp-svc-${s.code}`}
            disabled={s.soon}
            onClick={() => s.route && navigate(s.route)}
            className="rounded-3xl overflow-hidden text-left flex flex-col min-h-[170px] motion-fast active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ border: "1px solid #2a2a2a", backgroundColor: "#0f0f0f" }}
          >
            <div className="h-24 flex items-center justify-center relative" style={{ background: `radial-gradient(circle at 50% 55%, ${YELLOW}18, transparent 70%)` }}>
              {s.image
                ? <img src={s.image} alt={s.title} className="max-h-20 w-auto object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]" loading="lazy" />
                : <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: YELLOW_TINT }}>{s.icon && <s.icon size={22} color={YELLOW} />}</div>}
              {s.soon && (
                <span className="absolute top-2 right-2 inline-block px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: "#0a0a0a", border: "1px solid #2a2a2a", color: YELLOW }}>Soon</span>
              )}
            </div>
            <div className="p-3.5 flex-1 flex flex-col justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-white leading-tight">{s.title}</div>
                <div className="text-[11px] text-white/55 mt-1">{s.subtitle}</div>
              </div>
              <div className="flex items-center justify-end">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: s.soon ? "#2a2a2a" : YELLOW }}>
                  <ArrowRight size={13} color={s.soon ? "#8a8a8a" : "#0a0a0a"} strokeWidth={2.5} />
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="px-4 mt-5">
        <div className="rounded-2xl p-3 flex items-center gap-3" style={{ border: "1px solid #2a2a2a", backgroundColor: "#111111" }}>
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ backgroundColor: YELLOW_TINT }}><Package size={16} color={YELLOW} /></div>
          <div className="text-[11px] text-white/70 flex-1">Need something custom? <span className="text-white font-semibold">Contact our team</span> for large fleet contracts and monthly invoicing.</div>
        </div>
      </div>
    </div>
  );
};
