export const formatMoney = (amount: number, currency = 'XOF', symbol?: string, lang = 'fr') => {
  const decimals = currency === 'XOF' ? 0 : 2;
  const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount || 0);
  return `${n} ${symbol || currency}`;
};

export const formatDate = (iso?: string | null, lang = 'fr') => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};
