const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama3-70b-8192';

module.exports = {
  PORT,
  GROQ_API_KEY,
  GROQ_MODEL,
  DATA_DIR,
};


