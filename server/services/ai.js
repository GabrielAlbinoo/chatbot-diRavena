const Groq = require('groq-sdk');
const { GROQ_API_KEY, GROQ_MODEL } = require('../config/env');

function createGroqClient() {
  return new Groq({ apiKey: GROQ_API_KEY });
}

async function generateText({ messages, model = GROQ_MODEL }) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada');
  const groq = createGroqClient();
  const chat = await groq.chat.completions.create({
    model,
    messages,
    temperature: 0,
    max_tokens: 600,
  });
  return chat?.choices?.[0]?.message?.content || '';
}

module.exports = { generateText };


