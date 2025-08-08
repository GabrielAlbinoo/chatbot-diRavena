const path = require('path');
const fs = require('fs').promises;
const { DATA_DIR } = require('../config/env');

let productsData = null;
let collectionsData = null;
let siteInfoData = null;
let termsData = null;
let privacyData = null;
let refundData = null;

async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function loadScrapedData() {
  try {
    const productsPath = path.join(DATA_DIR, 'diravena-products.json');
    const collectionsPath = path.join(DATA_DIR, 'diravena-collections.json');
    const siteInfoPath = path.join(DATA_DIR, 'diravena-site-info.json');
    const termsPath = path.join(DATA_DIR, 'diravena-terms.json');
    const privacyPath = path.join(DATA_DIR, 'diravena-privacy.json');
    const refundPath = path.join(DATA_DIR, 'diravena-refund.json');

    try { productsData = await readJson(productsPath); } catch (_) { productsData = null; }
    try { collectionsData = await readJson(collectionsPath); } catch (_) { collectionsData = null; }
    try { siteInfoData = await readJson(siteInfoPath); } catch (_) { siteInfoData = null; }
    try { termsData = await readJson(termsPath); } catch (_) { termsData = null; }
    try { privacyData = await readJson(privacyPath); } catch (_) { privacyData = null; }
    try { refundData = await readJson(refundPath); } catch (_) { refundData = null; }

  } catch (error) {
    console.log('Erro ao carregar dados:', error.message);
  }
}

function getData() {
  return {
    productsData,
    collectionsData,
    siteInfoData,
    termsData,
    privacyData,
    refundData,
  };
}

module.exports = {
  loadScrapedData,
  getData,
};


