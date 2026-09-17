/**
 * `/cart` route redirect — Fixing_Prompt v4 choice §2b.
 *
 * When a customer hits `/cart` directly (browser back button, bookmark,
 * shared link, or a legacy component still using `navigate('/cart')`), we
 * do NOT render the full-page CartPage on desktop anymore. Instead we
 * open the drawer and redirect to the customer's "previous" page, which
 * for a direct hit means the module home.
 *
 * Mobile still routes to the full-page CartPage, so this component is
 * only mounted inside the `DesktopCustomerShell`. Choice §1b keeps the
 * full-page cart alive as the mobile shopping model.
 */
import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useCart } from "../../contexts/BakedContexts";

export const CartRouteDrawerRedirect = ({ fallback = "/" }) => {
  const { openCart } = useCart();
  useEffect(() => { openCart(); }, [openCart]);
  return <Navigate to={fallback} replace />;
};

export default CartRouteDrawerRedirect;
