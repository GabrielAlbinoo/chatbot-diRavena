// Normaliza texto para comparação: remove acentos e deixa minúsculo
function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

// Converte preços no padrão pt-BR, incluindo milhares ("R$ 1.299,90") em número 1299.90
function parsePriceToNumber(priceText) {
  if (priceText == null) return Number.NaN;
  let s = String(priceText).trim();
  s = s.replace(/\s+/g, '');
  s = s.replace(/[R$]/g, '');
  if (s.includes(',')) {
    // Formato BR: remove separadores de milhar '.' e troca vírgula por ponto
    s = s.replace(/\./g, '');
    s = s.replace(',', '.');
  } else {
    // Se houver múltiplos pontos, assume que só o último é decimal
    const parts = s.split('.');
    if (parts.length > 2) {
      const last = parts.pop();
      s = parts.join('') + '.' + last;
    }
  }
  const parsed = parseFloat(s);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/*
 * Filtra produtos dos dados raspados por termos e faixa de preço, retornando
 * a lista ordenada por preço crescente. Aceita múltiplos termos (ex.: ["sapato","nude"]).
 */
function searchProducts(productsData, query, maxPrice = null, minPrice = null) {
  if (!productsData?.products) return [];

  const all = productsData.products;
  let filtered = all
    .map((product) => ({
      ...product,
      __priceNumber: parsePriceToNumber(product.price),
      __nameNorm: normalizeText(product.name),
    }))
    .filter((p) => Number.isFinite(p.__priceNumber));

  if (maxPrice !== null || minPrice !== null) {
    filtered = filtered.filter((product) => {
      const price = product.__priceNumber;
      if (maxPrice !== null && price > maxPrice) return false; // "até X" ⇒ preço <= X
      if (minPrice !== null && price < minPrice) return false;
      return true;
    });
  }

  if (query && (Array.isArray(query) || String(query).trim().length > 0)) {
    // Todos os termos precisam aparecer no nome normalizado
    const terms = (Array.isArray(query) ? query : String(query).split(/\s+/))
      .map((t) => normalizeText(t))
      .filter((t) => t.length > 0);

    if (terms.length > 0) {
      let results = filtered.filter((product) =>
        terms.every((t) => product.__nameNorm.includes(t))
      );
      // Fallback por prefixo curto (stem) se nada encontrado
      if (results.length === 0) {
        const stems = terms.map((t) => t.slice(0, Math.min(4, t.length)));
        results = filtered.filter((product) => stems.every((s) => product.__nameNorm.includes(s)));
      }
      filtered = results;
    }
  }

  // Ordena por preço crescente para respostas determinísticas
  filtered.sort((a, b) => a.__priceNumber - b.__priceNumber);

  // Remove campos auxiliares antes de retornar
  return filtered.map(({ __priceNumber, __nameNorm, ...rest }) => rest);
}

/*
 * Retorna políticas (Termos, Privacidade/Cookies, Reembolso) com base em
 * intenção (palavras-chave) e também por ocorrência de texto nas seções.
 */
function searchPolicies(termsData, privacyData, refundData, query) {
  const allPolicies = [];

  if (termsData?.data?.sections) {
    allPolicies.push({ type: 'Termos de Serviço', key: 'terms', data: termsData.data });
  }
  if (privacyData?.data?.sections) {
    allPolicies.push({ type: 'Política de Privacidade', key: 'privacy', data: privacyData.data });
  }
  if (refundData?.data?.sections) {
    allPolicies.push({ type: 'Política de Reembolso', key: 'refund', data: refundData.data });
  }

  if (!query) return allPolicies;
  const searchTermRaw = String(query || '');
  const searchTerm = normalizeText(searchTermRaw);

  // Mapeamento direto por intenções
  const wantsRefund = /(reembolso|troca|devolucao|devolução|cancelamento)/.test(searchTerm);
  const wantsPrivacy = /(privacidade|dados pessoais|lgpd|cookie|cookies)/.test(searchTerm);
  const wantsTerms = /(termo|condicao|condição|termos)/.test(searchTerm);

  const directMatches = allPolicies.filter((p) =>
    (wantsRefund && p.key === 'refund') ||
    (wantsPrivacy && p.key === 'privacy') ||
    (wantsTerms && p.key === 'terms')
  );

  const textMatches = allPolicies.filter((policy) =>
    policy.data.sections.some((section) => {
      const t = normalizeText(section.title || '');
      const c = normalizeText(section.content || '');
      return t.includes(searchTerm) || c.includes(searchTerm);
    })
  );

  // Unir sem duplicar
  const merged = [...directMatches];
  textMatches.forEach((p) => {
    if (!merged.find((m) => m.key === p.key)) merged.push(p);
  });

  return merged.length ? merged : allPolicies;
}

module.exports = {
  searchProducts,
  searchPolicies,
};


