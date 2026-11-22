const SYMBOLS: Record<string, string> = { XOF: 'CFA', XAF: 'FCFA', INR: '₹', EUR: '€', USD: '$' };

export const formatMoney = (amount: number, currency = 'XOF', symbol?: string, lang = 'fr') => {
  const decimals = currency === 'XOF' ? 0 : 2;
  const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount || 0);
  return `${n} ${symbol || SYMBOLS[currency] || currency}`;
};

export const formatDate = (iso?: string | null, lang = 'fr') => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

// Upper-case a label but keep module brand names as written (bFOOD, not BFOOD).
export const capsBrand = (s?: string | null) => (s || '').toUpperCase().replace(/\bB(MART|FOOD|SHOP|SEND|IMMO|AUTO)\b/g, 'b$1');
