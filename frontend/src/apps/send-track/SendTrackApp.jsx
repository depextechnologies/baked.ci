/**
 * SendTrackApp — public SENDbakēd customer tracking page.
 *
 * URL: /send/track/:jobId?t=<share_token>
 *
 * Renders: live driver map (server-provided driver position),
 *          delivery stage, and the shared JobChat panel. No login;
 *          all API calls carry `?t=<share_token>` for auth.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useParams, useSearchParams } from "react-router-dom";
import { Loader2, Package, MessageCircle, Navigation, MapPin, Phone as PhoneIcon, Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { DriverNavMap } from "../driver/DriverNavMap";
import { JobChat } from "../driver/JobChat";

const API_BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;
const trackApi = axios.create({ baseURL: API_BASE });

const STAGE_LABEL = {
  offered:          { title: "Finding a driver",  sub: "Sit tight — we're offering the job to nearby drivers." },
  accepted:         { title: "Driver is coming",  sub: "Your rider is on the way to pickup." },
  arriving_pickup:  { title: "Driver at pickup",  sub: "The rider is verifying pickup." },
  picked_up:        { title: "On the way",        sub: "Your parcel is on its way to you." },
  arriving_dropoff: { title: "Arriving soon",     sub: "Your rider is at the drop-off — check outside." },
  delivered:        { title: "Delivered",         sub: "Enjoy!" },
  cancelled:        { title: "Cancelled",         sub: "This delivery was cancelled." },
  expired:          { title: "Expired",           sub: "This tracking link is no longer active." },
};

const fmtMoney = (amt, cur) =>
  cur === "INR" ? `₹${Number(amt || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                : `${Number(amt || 0).toLocaleString()} ${cur === "XOF" ? "CFA" : cur}`;

export const SendTrackApp = () => {
  const { jobId } = useParams();
  const [sp] = useSearchParams();
  const token = sp.get("t");

  const [job, setJob]     = useState(null);
  const [error, setError] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread]     = useState(0);

  const loadJob = useCallback(async () => {
    if (!token) { setError("missing_token"); return; }
    try {
      const { data } = await trackApi.get(`/send/track/${jobId}`, { params: { t: token } });
      setJob(data);
    } catch (e) {
      setError(e?.response?.status === 404 ? "not_found" : "network");
    }
  }, [jobId, token]);

  useEffect(() => {
    loadJob();
    const t = setInterval(loadJob, 5000);
    return () => clearInterval(t);
  }, [loadJob]);

  const listMessages = useCallback(async (after) => {
    const { data } = await trackApi.get(`/send/track/${jobId}/messages`, {
      params: after ? { t: token, after } : { t: token },
    });
    return data;
  }, [jobId, token]);

  const sendMessage = useCallback(async (payload) => {
    const { data } = await trackApi.post(`/send/track/${jobId}/messages`, payload, { params: { t: token } });
    return data;
  }, [jobId, token]);

  useEffect(() => { document.title = "SENDbakēd · Track your delivery"; }, []);

  // The customer map wants the driver's server-side coordinate as origin.
  const driverPos = useMemo(() => {
    if (job?.driver?.current_lat != null && job?.driver?.current_lng != null) {
      return { lat: job.driver.current_lat, lng: job.driver.current_lng };
    }
    return null;
  }, [job?.driver?.current_lat, job?.driver?.current_lng]);

  if (error === "missing_token") return <Fallback icon="key" title="This link is missing a security token" body="Please open the tracking link from your SMS." />;
  if (error === "not_found")     return <Fallback icon="404" title="Tracking link not found" body="The link may have expired. If you were expecting a delivery, contact support." />;
  if (!job) return (
    <Shell>
      <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" size={22} /></div>
    </Shell>
  );

  const stage = STAGE_LABEL[job.status] || STAGE_LABEL.offered;
  const chatClosed = !["offered","accepted","arriving_pickup","picked_up","arriving_dropoff"].includes(job.status);

  return (
    <Shell>
      <div className="px-6 pt-6 pb-32 space-y-4" data-testid="send-track-page">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-orange-500">SENDbakēd · Delivery</div>
          <h1 className="text-3xl font-bold mt-2" data-testid="send-track-stage-title">{stage.title}</h1>
          <p className="text-white/60 mt-1 text-sm">{stage.sub}</p>
        </div>

        {/* Map */}
        <div className="mt-2">
          <DriverNavMap job={job} driverPosition={driverPos || { lat: job.pickup.lat, lng: job.pickup.lng }} />
        </div>

        {/* Driver card */}
        {job.driver && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 flex items-center gap-3"
               data-testid="send-track-driver">
            <div className="w-12 h-12 rounded-2xl grid place-items-center"
                 style={{ background: "linear-gradient(135deg, #FFB454, #FF7A00)" }}>
              <Truck size={20} color="#000" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{job.driver.name || "Your rider"}</div>
              <div className="text-[11px] text-white/50 capitalize">
                {(job.driver.vehicle_type || "").replaceAll("_", " ")} · {job.driver.vehicle_plate || "—"}
              </div>
            </div>
            {job.driver.phone_e164 && (
              <a href={`tel:${job.driver.phone_e164}`} data-testid="send-track-call"
                 className="w-10 h-10 rounded-full bg-white/10 grid place-items-center border border-white/10">
                <PhoneIcon size={14} />
              </a>
            )}
          </div>
        )}

        {/* Address strip */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-500 grid place-items-center shrink-0"><MapPin size={14} /></div>
            <div><div className="text-[10px] uppercase tracking-widest text-white/40">Pickup</div>
                 <div className="text-sm">{job.pickup.label}</div></div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-white/10 grid place-items-center shrink-0"><Navigation size={14} /></div>
            <div><div className="text-[10px] uppercase tracking-widest text-white/40">Drop-off</div>
                 <div className="text-sm">{job.dropoff.label}</div></div>
          </div>
          <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
            <span className="text-white/50">Fare</span>
            <span className="font-semibold">{fmtMoney(job.fare.amount, job.fare.currency)}</span>
          </div>
        </div>

        {job.status === "delivered" && (
          <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3"
               data-testid="send-track-delivered">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 grid place-items-center">
              <CheckCircle2 size={18} className="text-emerald-400" />
            </div>
            <div className="text-sm">Delivered — thanks for using SENDbakēd!</div>
          </div>
        )}
      </div>

      {/* Floating chat FAB */}
      <button onClick={() => setChatOpen(true)} data-testid="send-track-chat-fab"
              className="fixed bottom-6 right-6 w-14 h-14 rounded-full grid place-items-center text-black shadow-[0_20px_50px_-10px_rgba(255,122,0,0.6)]"
              style={{ background: "linear-gradient(135deg, #FFB454, #FF7A00)", zIndex: 45 }}
              aria-label="Message rider">
        <MessageCircle size={22} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center border-2 border-black"
                data-testid="send-track-chat-unread">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <JobChat open={chatOpen} onClose={() => setChatOpen(false)}
               listMessages={listMessages} sendMessage={sendMessage}
               mySender="customer" chatClosed={chatClosed}
               onUnreadChange={setUnread} />
    </Shell>
  );
};

const Shell = ({ children }) => (
  <div className="min-h-screen w-full flex justify-center bg-black text-white"
       style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
    <div className="w-full max-w-[440px] min-h-screen bg-black relative overflow-x-hidden">
      {children}
    </div>
  </div>
);

const Fallback = ({ title, body }) => (
  <Shell>
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-3">
      <div className="w-16 h-16 rounded-2xl grid place-items-center"
           style={{ background: "linear-gradient(135deg, #FFB454, #FF7A00)" }}>
        <Package size={24} color="#000" />
      </div>
      <div className="text-lg font-semibold">{title}</div>
      <div className="text-sm text-white/60 max-w-xs">{body}</div>
    </div>
  </Shell>
);

export default SendTrackApp;
