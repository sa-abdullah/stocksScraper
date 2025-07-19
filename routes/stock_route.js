import express from 'express';
import Stock from '../models/data_model.js';

const router = express.Router();

/**
 * GET /api/stocks
 * Fetch all stocks with filtering, sorting, and pagination
 */
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      symbol,
      securityName,
      sortBy = 'symbol',
      sortOrder = 'asc',
      minClose,
      maxClose,
      startDate,
      endDate
    } = req.query;

    const query = {};

    // Filters
    if (symbol) query.symbol = new RegExp(symbol, 'i');
    if (securityName) query.securityName = new RegExp(securityName, 'i');
    if (minClose) query.close = { ...query.close, $gte: parseFloat(minClose) };
    if (maxClose) query.close = { ...query.close, $lte: parseFloat(maxClose) };

    // Date range filter
    if (startDate || endDate) {
      query.scrapedAt = {};
      if (startDate) query.scrapedAt.$gte = new Date(startDate);
      if (endDate) query.scrapedAt.$lte = new Date(endDate);
    }

    // Sorting
    const validSortFields = ['symbol', 'securityName', 'open', 'high', 'low', 'close', 'change', 'dailyVolume', 'dailyValue', 'scrapedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'symbol';
    const sortOptions = { [sortField]: sortOrder === 'desc' ? -1 : 1 };

    const skip = (page - 1) * limit;

    const [stocks, total] = await Promise.all([
      Stock.find(query)
        .sort(sortOptions)
        .limit(Number(limit))
        .skip(skip)
        .lean(),
      Stock.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: stocks,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ Error fetching stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stocks/latest
 * Fetch the latest version of each stock
 */
router.get('/latest', async (req, res) => {
  try {
    const { limit = 150 } = req.query;
    const stocks = await Stock.findLatest(Number(limit));
    res.json({ success: true, data: stocks, count: stocks.length });
  } catch (error) {
    console.error('❌ Error fetching latest stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stocks/summary
 * Market summary stats
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await Stock.getMarketSummary();
    res.json({
      success: true,
      data: summary[0] || {
        totalStocks: 0,
        totalVolume: 0,
        totalValue: 0,
        avgPrice: 0,
        gainers: 0,
        losers: 0,
        unchanged: 0
      }
    });
  } catch (error) {
    console.error('❌ Error fetching market summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stocks/active
 * Most active stocks by volume
 */
router.get('/active', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const activeStocks = await Stock.find({ dailyVolume: { $gt: 0 } })
      .sort({ dailyVolume: -1 })
      .limit(Number(limit))
      .lean();
    res.json({ success: true, data: activeStocks, count: activeStocks.length });
  } catch (error) {
    console.error('❌ Error fetching active stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stocks/:symbol
 * Get stock by symbol
 */
router.get('/:symbol', async (req, res) => {
  try {
    const stock = await Stock.findOne({ symbol: req.params.symbol.toUpperCase() }).lean();
    if (!stock) return res.status(404).json({ success: false, error: 'Stock not found' });
    res.json({ success: true, data: stock });
  } catch (error) {
    console.error('❌ Error fetching stock:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stocks/:symbol/history
 * Get stock history with date filter
 */
router.get('/:symbol/history', async (req, res) => {
  try {
    const { startDate, endDate, limit = 100 } = req.query;
    const query = { symbol: req.params.symbol.toUpperCase() };

    if (startDate || endDate) {
      query.scrapedAt = {};
      if (startDate) query.scrapedAt.$gte = new Date(startDate);
      if (endDate) query.scrapedAt.$lte = new Date(endDate);
    }

    const history = await Stock.find(query)
      .sort({ scrapedAt: -1 })
      .limit(Number(limit))
      .select('open high low close change dailyVolume dailyValue scrapedAt')
      .lean();

    res.json({ success: true, data: history, count: history.length });
  } catch (error) {
    console.error('❌ Error fetching stock history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/stocks/search/:query
 * Search by symbol or security name
 */
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 20 } = req.query;
    const stocks = await Stock.find({
      $or: [{ symbol: new RegExp(query, 'i') }, { securityName: new RegExp(query, 'i') }]
    })
      .sort({ symbol: 1 })
      .limit(Number(limit))
      .lean();

    res.json({ success: true, data: stocks, count: stocks.length });
  } catch (error) {
    console.error('❌ Error searching stocks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
