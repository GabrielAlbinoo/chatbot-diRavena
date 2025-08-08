const { Router } = require('express');
const { getData } = require('../data/loader');
const { searchProducts, searchPolicies } = require('../services/search');
const { generateText } = require('../services/ai');
const { buildSystemPrompt } = require('../services/prompt');

const router = Router();

// Reconhece saudações básicas sem acentos
function isGreeting(messageLower) {
  const text = messageLower.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return /(\b|^)(oi|ola|ola|opa|eae|fala|hey|hello|hi|bom dia|boa tarde|boa noite)(\b|$)/.test(text);
}

// Extrai "até X"/"por X" → retorna valor numérico (pt-BR → número)
function extractMaxPriceFromMessage(message) {
  const text = String(message);
  // captura números com ou sem R$, com vírgula de centavos
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

// Extrai faixa "entre X e Y"/"de X a Y"/"X - Y" → min/max numéricos
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

// Extrai um termo de categoria principal (fallback para busca geral)
function extractSearchTerm(messageLower) {
  // aceita variações com/sem acento e plurais simples
  const lower = messageLower.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (/(sapato|calcado|calcados)/.test(lower)) return 'sapato';
  if (/(sandalia|sandalias)/.test(lower)) return 'sandalia';
  if (/(tenis|mocatenis|mocass?im|sapatenis)/.test(lower)) return 'tenis';
  if (/(bota|botas)/.test(lower)) return 'bota';
  // retorna string vazia para buscar geral
  return '';
}

// Extrai termos úteis de busca: categoria + cores comuns (ex.: ["sapato","nude"]) 
function extractProductTerms(message) {
  const lower = String(message).toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const terms = [];
  // categorias
  if (/(sapato|calcado|calcados)/.test(lower)) terms.push('sapato');
  if (/(sandalia|sandalias)/.test(lower)) terms.push('sandalia');
  if (/(tenis|mocatenis|mocass?im|sapatenis)/.test(lower)) terms.push('tenis');
  if (/(bota|botas)/.test(lower)) terms.push('bota');
  // cores comuns
  const colorWords = ['nude','preto','branco','marrom','bege','caramelo','rosa','azul','verde','vermelho','cinza','grafite','off','off white','amarelo','vinho','creme'];
  colorWords.forEach((c) => { if (lower.includes(c)) terms.push(c); });
  // remove duplicados
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

router.post('/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    const { productsData, termsData, privacyData, refundData } = getData();
    let contextData = '';
    const lowerMessage = String(message).toLowerCase();

    // Saudações: deixam o modelo responder com base nas regras
    // (não retornamos resposta pronta, apenas seguimos gerando contexto)

    const wantsProducts = shouldSearchProducts(lowerMessage, message);
    const wantsPolicies = shouldSearchPolicies(lowerMessage);

    // Fora do domínio: deixamos para o modelo aplicar a regra no prompt

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
        // Injetamos no contexto para o modelo responder
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

    // Limita histórico para performance (últimas 6 mensagens)
    if (Array.isArray(history)) {
      const recent = history.slice(-6);
      recent.forEach((h) => {
        const role = h.role === 'user' ? 'user' : 'assistant';
        if (h.content) messages.push({ role, content: String(h.content) });
      });
    }

    messages.push({ role: 'user', content: String(message) });

    const text = await generateText({ messages });
    return res.json({ response: text, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Erro no chat:', error);
    return res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
});

module.exports = router;


