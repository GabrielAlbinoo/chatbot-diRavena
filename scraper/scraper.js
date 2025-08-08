const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function scrapeDiravena() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto('https://diravena.com/', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('.grid__item.grid-product', { timeout: 10000 });
    const pageData = await page.evaluate(() => {
      const data = { products: [], collections: [], siteInfo: {} };
      const productElements = document.querySelectorAll('.grid__item.grid-product');
      productElements.forEach((element) => {
        try {
          const titleElement = element.querySelector('.grid-product__title');
          const name = titleElement ? titleElement.textContent.trim() : '';
          const linkElement = element.querySelector('.grid-product__image-link');
          const link = linkElement ? linkElement.href : '';
          const priceElement = element.querySelector('.grid-product__price');
          let price = '';
          if (priceElement) {
            const priceText = priceElement.textContent.trim();
            price = priceText.replace(/[^\d,.]/g, '').trim();
          }
          const discountElement = element.querySelector('.grid-product__on-sale p');
          let discount = '';
          if (discountElement) {
            const discountText = discountElement.textContent.trim();
            discount = discountText.replace(/[^\d]/g, '').trim();
          }
          const imageElement = element.querySelector('.product--image');
          let image = '';
          if (imageElement) {
            image = imageElement.src || imageElement.getAttribute('data-src') || '';
          }
          if (name && price) {
            data.products.push({ name, price, discount, link, image });
          }
        } catch (_) {}
      });
      const collectionElements = document.querySelectorAll('a[href*="/collections/"]');
      collectionElements.forEach((element) => {
        try {
          const name = element.textContent.trim();
          const link = element.href;
          if (name && link && !data.collections.find((c) => c.name === name)) {
            data.collections.push({ name, link });
          }
        } catch (_) {}
      });
      const siteTitle = document.querySelector('title');
      const siteDescription = document.querySelector('meta[name="description"]');
      const siteKeywords = document.querySelector('meta[name="keywords"]');
      data.siteInfo = {
        title: siteTitle ? siteTitle.textContent.trim() : '',
        description: siteDescription ? siteDescription.getAttribute('content') : '',
        keywords: siteKeywords ? siteKeywords.getAttribute('content') : '',
        url: window.location.href,
      };
      return data;
    });
    const products = pageData.products;
    const collections = pageData.collections;
    const siteInfo = pageData.siteInfo;
    const productsData = { scrapedAt: new Date().toISOString(), source: 'https://diravena.com/', type: 'products', totalProducts: products.length, products };
    const collectionsData = { scrapedAt: new Date().toISOString(), source: 'https://diravena.com/', type: 'collections', totalCollections: collections.length, collections };
    const siteData = { scrapedAt: new Date().toISOString(), source: 'https://diravena.com/', type: 'site-info', siteInfo };
    const productsPath = path.join(__dirname, '..', 'data', 'diravena-products.json');
    const collectionsPath = path.join(__dirname, '..', 'data', 'diravena-collections.json');
    const siteInfoPath = path.join(__dirname, '..', 'data', 'diravena-site-info.json');
    await fs.mkdir(path.dirname(productsPath), { recursive: true });
    await fs.writeFile(productsPath, JSON.stringify(productsData, null, 2), 'utf8');
    await fs.writeFile(collectionsPath, JSON.stringify(collectionsData, null, 2), 'utf8');
    await fs.writeFile(siteInfoPath, JSON.stringify(siteData, null, 2), 'utf8');
    return { products: productsData, collections: collectionsData, siteInfo: siteData };
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  scrapeDiravena()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { scrapeDiravena };
