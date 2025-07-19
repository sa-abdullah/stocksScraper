import puppeteer from 'puppeteer';
import Stock from './models/data_model.js';
import connectDB from './config/database.js';
import { config } from 'dotenv';

config();

class StockScraper {
  constructor() {
    this.targetUrl =
      'https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/market-news/equities-price-listing';
    this.browser = null;
    this.page = null;
  }

  async initPuppeteer() {
    console.log('🚀 Launching Puppeteer...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1366, height: 768 });

    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Block unnecessary resources
    await this.page.setRequestInterception(true);
    this.page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log('✅ Puppeteer initialized');
  }

  async wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async scrapeStockData() {
    try {
      console.log('🔄 Starting stock data scrape...');
      await this.initPuppeteer();

      console.log(`🌍 Navigating to ${this.targetUrl}`);
      await this.page.goto(this.targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // ✅ Check if data is inside an iframe
      const frames = this.page.frames();
      let targetFrame = this.page;
      if (frames.length > 1) {
        console.log(`🔍 Detected ${frames.length} frames. Checking for iframe...`);
        const candidate = frames.find((frame) => frame.url().includes('equities-price-listing'));
        if (candidate) {
          console.log('✅ Switching to iframe context');
          targetFrame = candidate;
        }
      }

      console.log('⏳ Waiting for table rows...');
      await targetFrame.waitForFunction(
        () => document.querySelectorAll('table tr').length > 5,
        { timeout: 30000 }
      );

      // ✅ Extract stock data
      console.log('📊 Extracting stock data...');
      const stockData = await targetFrame.evaluate(() => {
        const cleanSymbol = (str) =>
          (str || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const cleanText = (str) => (str || '').trim();
        const parseNumber = (str) => {
          if (!str || str === '-' || str === 'N/A') return 0;
          const cleaned = str.replace(/[^\d.-]/g, '');
          return parseFloat(cleaned) || 0;
        };

        const rows = document.querySelectorAll('table tr');
        const stocks = [];

        rows.forEach((row, index) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 8) {
            stocks.push({
              symbol: cleanSymbol(cells[0].innerText),
              securityName: cleanText(cells[1].innerText),
              open: parseNumber(cells[2].innerText),
              high: parseNumber(cells[3].innerText),
              low: parseNumber(cells[4].innerText),
              close: parseNumber(cells[5].innerText),
              change: parseNumber(cells[6].innerText),
              dailyVolume: parseNumber(cells[7].innerText),
              dailyValue: parseNumber(cells[8]?.innerText || '0'),
            });
          }
        });

        return stocks.filter((s) => s.symbol && s.close > 0);
      });

      console.log(`✅ Extracted ${stockData.length} stocks`);

      if (stockData.length === 0) {
        console.log('⚠️ No stock data found in table. Possible API loading.');
      }

      // Add metadata
      const processedStocks = stockData.map((stock) => ({
        ...stock,
        scrapedAt: new Date(),
      }));

      const savedStocks = await this.saveToMongoDB(processedStocks);
      console.log(`💾 Saved ${savedStocks.length} stocks to MongoDB`);

      return savedStocks;
    } catch (error) {
      console.error('❌ Scraping error:', error.message);
      return [];
    } finally {
      await this.closePuppeteer();
    }
  }

  async saveToMongoDB(stockData) {
    if (!stockData.length) return [];
    const savedStocks = [];
    for (const stockInfo of stockData) {
      const stock = await Stock.findOneAndUpdate(
        { symbol: stockInfo.symbol },
        stockInfo,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      savedStocks.push(stock);
    }
    return savedStocks;
  }

  async closePuppeteer() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      console.log('✅ Browser closed');
    } catch (err) {
      console.error('❌ Error closing browser:', err.message);
    }
  }
}

// Export
export const runScraper = async () => {
  await connectDB();
  const scraper = new StockScraper();
  return await scraper.scrapeStockData();
};

// CLI run
if (process.argv[1] === new URL(import.meta.url).pathname) {
  runScraper()
    .then((result) => {
      console.log(`🏁 Scraping completed: ${result.length} stocks`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('🚨 Scraping failed:', err.message);
      throw err;
    });
}

export { StockScraper };
