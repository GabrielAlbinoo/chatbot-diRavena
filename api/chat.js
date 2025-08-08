const { getData, loadScrapedData } = require('../server/data/loader');
const { searchProducts, searchPolicies } = require('../server/services/search');
const { generateText } = require('../server/services/ai');
const { buildSystemPrompt } = require('../server/services/prompt');

let initialized = false;
async function ensureInitialized() {
  if (!initialized) {
    await loadScrapedData();
    initialized = true;
  }
}

function extractMaxPriceFromMessage(message) {
  const text = String(message);
  const patterns = [
    /(?:abaixo de|menos de|ate|até)\s*R?\$?\s*(\d{1,3}(?:[\.,]\d{2})?)/i,
    /por\s*R?\$?\s*(\d{1,3}(?:[\.,]\d{2})?)\s*(?:ou\s*menos)?/i,
    /(?:ate|até)\s*(\d{1,3}(?:[\.,]\d{2})?)\s*(?:reais|rs|r\$)?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const num = parseFloat(String(m[1]).replace('.', '').replace(',', '.'));
      if (Number.isFinite(num)) return num;
    }
  }
  return null;
}

function extractRangePricesFromMessage(message) {
  const text = String(message);
  const patterns = [
    /entre\s*R?\$?\s*(\d{1,3}(?:[\.,]\d{2})?)\s*(?:e|a)\s*R?\$?\s*(\d{1,3}(?:[\.,]\d{2})?)/i,
    /de\s*R?\$?\s*(\d{1,3}(?:[\.,]\d{2})?)\s*(?:a|ate|até)\s*R?\$?\s*(\d{1,3}(?:[\.,]\d{2})?)/i,
    /(\d{1,3})(?:\s*reais)?\s*-\s*(\d{1,3})(?:\s*reais)?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n1 = parseFloat(String(m[1]).replace('.', '').replace(',', '.'));
      const n2 = parseFloat(String(m[2]).replace('.', '').replace(',', '.'));
      if (Number.isFinite(n1) && Number.isFinite(n2)) {
        const min = Math.min(n1, n2);
        const max = Math.max(n1, n2);
        return { minPrice: min, maxPrice: max };
      }
    }
  }
  return { minPrice: null, maxPrice: null };
}

function extractSearchTerm(messageLower) {
  const lower = messageLower.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/(sapato|calcado|calcados)/.test(lower)) return 'sapato';
  if (/(sandalia|sandalias)/.test(lower)) return 'sandalia';
  if (/(tenis|mocatenis|mocass?im|sapatenis)/.test(lower)) return 'tenis';
  if (/(bota|botas)/.test(lower)) return 'bota';
  return '';
}

function extractProductTerms(message) {
  const lower = String(message).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const terms = [];
  if (/(sapato|calcado|calcados)/.test(lower)) terms.push('sapato');
  if (/(sandalia|sandalias)/.test(lower)) terms.push('sandalia');
  if (/(tenis|mocatenis|mocass?im|sapatenis)/.test(lower)) terms.push('tenis');
  if (/(bota|botas)/.test(lower)) terms.push('bota');
  const colorWords = ['nude','preto','branco','marrom','bege','caramelo','rosa','azul','verde','vermelho','cinza','grafite','off','off white','amarelo','vinho','creme'];
  colorWords.forEach((c) => { if (lower.includes(c)) terms.push(c); });
  return Array.from(new Set(terms));
}

function shouldSearchProducts(messageLower, rawMessage) {
  const mentionsCategory = (
    messageLower.includes('produto') ||
    messageLower.includes('sapato') ||
    messageLower.includes('calçado') ||
    messageLower.includes('mocatênis') ||
    messageLower.includes('sapatênis') ||
    messageLower.includes('bota') ||
    messageLower.includes('sandália') ||
    messageLower.includes('tênis') ||
    messageLower.includes('nude') ||
    messageLower.includes('cor')
  );
  const mentionsPriceWords = (
    messageLower.includes('preço') ||
    messageLower.includes('valor') ||
    messageLower.includes('abaixo de') ||
    messageLower.includes('menos de') ||
    messageLower.includes('até') ||
    messageLower.includes('ate') ||
    messageLower.includes('entre') ||
    messageLower.includes('reais')
  );
  const mentionsLink = (
    messageLower.includes('link') ||
    messageLower.includes('links') ||
    messageLower.includes('url')
  );
  const mentionsPricePattern = /por\s*R?\$?\s*\d+\s*(?:ou\s*menos)?/i.test(rawMessage);
  return mentionsCategory || mentionsPriceWords || mentionsPricePattern || mentionsLink;
}

function shouldSearchPolicies(messageLower) {
  const lower = messageLower.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return (
    lower.includes('termo') ||
    lower.includes('politica') ||
    lower.includes('reembolso') ||
    lower.includes('troca') ||
    lower.includes('devolucao') ||
    lower.includes('entrega') ||
    lower.includes('prazo') ||
    lower.includes('cancelamento') ||
    lower.includes('cookie') ||
    lower.includes('cookies') ||
    lower.includes('privacidade')
  );
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await ensureInitialized();

    const body = req.body || {};
    const { message, history } = body;
    if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    const { productsData, termsData, privacyData, refundData } = getData();
    let contextData = '';
    const lowerMessage = String(message).toLowerCase();

    const wantsProducts = shouldSearchProducts(lowerMessage, message);
    const wantsPolicies = shouldSearchPolicies(lowerMessage);

    if (wantsProducts) {
      const { minPrice, maxPrice: rangeMax } = extractRangePricesFromMessage(message);
      const maxPrice = rangeMax != null ? rangeMax : extractMaxPriceFromMessage(message);
      const terms = extractProductTerms(message);
      let products = searchProducts(productsData, terms.length ? terms : extractSearchTerm(lowerMessage), maxPrice, minPrice);

      function formatPriceValue(value) {
        if (value == null) return '';
        const num = Number(String(value).replace('.', '').replace(',', '.'));
        if (Number.isNaN(num)) return String(value);
        return num.toFixed(2).replace('.', ',');
      }

      if (products.length > 0) {
        contextData += '\n\nPRODUTOS ENCONTRADOS:\n';
        products.forEach((product, index) => {
          contextData += `${index + 1}. ${product.name}\n`;
          contextData += `   Preço: R$ ${product.price}\n`;
          if (product.discount) {
            contextData += `   Desconto: R$ ${product.discount}\n`;
          }
          contextData += `   Link: ${product.link}\n\n`;
        });
      } else {
        const allProducts = searchProducts(productsData, '', maxPrice, minPrice);
        if (allProducts.length > 0) {
          contextData += '\n\nPRODUTOS DISPONÍVEIS:\n';
          allProducts.slice(0, 10).forEach((product, index) => {
            contextData += `${index + 1}. ${product.name}\n`;
            contextData += `   Preço: R$ ${product.price}\n`;
            if (product.discount) {
              contextData += `   Desconto: R$ ${product.discount}\n`;
            }
            contextData += `   Link: ${product.link}\n\n`;
          });
        }
      }
    }

    if (wantsPolicies) {
      const policies = searchPolicies(termsData, privacyData, refundData, message);
      if (policies.length > 0) {
        contextData += '\n\nINFORMAÇÕES DAS POLÍTICAS:\n';
        policies.forEach((policy) => {
          const url = policy.data?.url || policy.data?.source || '';
          contextData += `${policy.type}${url ? `: ${url}` : ':'}\n`;
          policy.data.sections.forEach((section) => {
            contextData += `${section.title}\n`;
            if (section.content) {
              contextData += `${section.content.substring(0, 200)}...\n\n`;
            }
          });
        });
      }
    }

    const systemContent = buildSystemPrompt(contextData);
    const messages = [];
    messages.push({ role: 'system', content: systemContent });

    if (Array.isArray(history)) {
      const recent = history.slice(-6);
      recent.forEach((h) => {
        const role = h.role === 'user' ? 'user' : 'assistant';
        if (h.content) messages.push({ role, content: String(h.content) });
      });
    }

    messages.push({ role: 'user', content: String(message) });

    const text = await generateText({ messages });
    return res.status(200).json({ response: text, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Erro no chat (serverless):', error);
    return res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
};



