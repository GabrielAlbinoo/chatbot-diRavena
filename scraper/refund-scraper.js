const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function scrapeRefund() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto('https://diravena.com/policies/refund-policy', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('body', { timeout: 10000 });
    const refundData = await page.evaluate(() => {
      const mainContent = document.querySelector('main') || document.querySelector('.main-content') || document.body;
      const cleanText = (text) => text.replace(/\s+/g, ' ').trim();
      const extractTopicNumber = (text) => {
        const patterns = [/^(\d+)-/, /^(\d+\.\d+)/, /^(\d+\.\d+\.\d+)/, /^(\d+)/];
        for (const pattern of patterns) {
          const match = text.match(pattern);
          if (match) return match[1];
        }
        return null;
      };
      const organizeSections = () => {
        const sections = [];
        let currentMainSection = null;
        let currentSubSection = null;
        const possibleElements = mainContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div');
        possibleElements.forEach((element) => {
          const text = cleanText(element.textContent);
          if (text.match(/^\d+-/)) {
            const topicNumber = extractTopicNumber(text);
            currentMainSection = { number: topicNumber || '0', title: text, level: 1, content: '', subsections: [] };
            sections.push(currentMainSection);
            currentSubSection = null;
          } else if (text.match(/^\d+\.\d+/)) {
            const topicNumber = extractTopicNumber(text);
            if (currentMainSection) {
              currentSubSection = { number: topicNumber || '0.0', title: text, level: 2, content: '' };
              currentMainSection.subsections.push(currentSubSection);
            }
          } else if (text.match(/^\d+\.\s+[A-Z]/)) {
            const topicNumber = extractTopicNumber(text);
            currentMainSection = { number: topicNumber || '0', title: text, level: 1, content: '', subsections: [] };
            sections.push(currentMainSection);
            currentSubSection = null;
          } else if (text && currentMainSection) {
            if (currentSubSection) {
              currentSubSection.content += (currentSubSection.content ? '\n' : '') + text;
            } else {
              currentMainSection.content += (currentMainSection.content ? '\n' : '') + text;
            }
          }
        });
        return sections;
      };
      const sections = organizeSections();
      const title = document.querySelector('title')?.textContent.trim() || '';
      const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const links = [];
      const linkElements = mainContent.querySelectorAll('a[href]');
      const seenLinks = new Set();
      linkElements.forEach((link) => {
        const text = cleanText(link.textContent);
        const url = link.href;
        if (text && url && !seenLinks.has(url)) {
          links.push({ text, url });
          seenLinks.add(url);
        }
      });
      return { title, description, url: window.location.href, sections, links, fullText: cleanText(mainContent.textContent) };
    });
    const data = { scrapedAt: new Date().toISOString(), source: 'https://diravena.com/policies/refund-policy', type: 'refund-policy', data: refundData };
    const outputPath = path.join(__dirname, '..', 'data', 'diravena-refund.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf8');
    return data;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  scrapeRefund()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { scrapeRefund };
