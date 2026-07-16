export const HOME = {
  emergentLink: "home-emergent-link",
  hero: "mart-hero",
  shopNowBtn: "mart-shop-now-btn",
  browseCategoriesBtn: "mart-browse-categories-btn",
};

export const NAV = {
  logo: "top-nav-logo",
  deliveryAddress: "top-nav-delivery-address",
  searchInput: "top-nav-search-input",
  offers: "top-nav-offers",
  orders: "top-nav-orders",
  account: "top-nav-account",
  cartButton: "top-nav-cart-button",
  cartCount: "top-nav-cart-count",
  cartTotal: "top-nav-cart-total",
  themeToggle: "top-nav-theme-toggle",
  countrySelect: "top-nav-country-select",
};

export const MODULE_TAB = (code) => `module-tab-${code}`;

export const AUTH = {
  openLoginBtn: "auth-open-login-btn",
  phoneInput: "auth-phone-input",
  countryCodeSelect: "auth-country-code-select",
  sendCodeBtn: "auth-send-code-btn",
  otpInput: (i) => `auth-otp-input-${i}`,
  verifyBtn: "auth-verify-code-btn",
  resendBtn: "auth-resend-code-btn",
  changeNumberBtn: "auth-change-number-btn",
  googleBtn: "auth-google-btn",
  emailBtn: "auth-email-btn",
  createAccountBtn: "auth-create-account-btn",
  logoutBtn: "auth-logout-btn",
  devCodeHint: "auth-dev-code-hint",
};

export const PRODUCT = {
  card: (id) => `product-card-${id}`,
  addBtn: (id) => `product-add-btn-${id}`,
  removeBtn: (id) => `product-remove-btn-${id}`,
  qtyIncBtn: (id) => `product-qty-inc-${id}`,
  qtyDecBtn: (id) => `product-qty-dec-${id}`,
  detailAddBtn: "product-detail-add-btn",
  detailImg: "product-detail-image",
  detailName: "product-detail-name",
  detailPrice: "product-detail-price",
};

export const CATEGORY = {
  sidebarItem: (slug) => `category-sidebar-${slug}`,
  card: (slug) => `category-card-${slug}`,
};

export const CART = {
  itemRow: (id) => `cart-item-${id}`,
  subtotal: "cart-subtotal",
  checkoutBtn: "cart-checkout-btn",
  emptyState: "cart-empty-state",
};

export const AI = {
  searchInput: "ai-search-input",
  searchSubmit: "ai-search-submit",
  searchSummary: "ai-search-summary",
};
