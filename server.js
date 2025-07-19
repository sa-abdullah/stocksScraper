// server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { config } from 'dotenv';

import connectDB from './config/database.js';
import stockRoutes from './routes/stock_route.js';
import { runScraper } from './scraper.js';

// Load environment variables
config();

const app = express();
app.set('trust proxy', 1)

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.',
  },
  skip: (req) => req.path === '/api/scrape',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

// Connect to MongoDB
await connectDB();

// Routes
app.use('/api/stocks', stockRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Stanbic Stock Scraper API',
    version: '2.0.0',
    uptime: process.uptime(),
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Stanbic Stock Scraper API',
    version: '2.0.0',
    endpoints: {
      stocks: '/api/stocks',
      latest: '/api/stocks/latest',
      search: '/api/stocks/search/:query',
      bySymbol: '/api/stocks/:symbol',
      history: '/api/stocks/:symbol/history',
      bySector: '/api/stocks/sector/:sector',
      health: '/health',
      scrape: '/api/scrape',
    },
  });
});

// Manual scrape endpoint (for testing)
app.post('/api/scrape', async (req, res) => {
  try {
    console.log('🔄 Manual scrape triggered');
    const result = await runScraper();
    
    res.json({
      success: true,
      message: 'Scraping completed successfully',
      data: {
        count: result.length,
        stocks: result.slice(0, 5), // Show first 5 stocks
      },
    });
  } catch (error) {
    console.error('❌ Manual scrape failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: '/api',
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Global error handler:', error);
  
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error',
    ...(isDevelopment && { stack: error.stack }),
  });
});

// Schedule daily scraping at 9 AM Nigerian time
cron.schedule('0 18 * * *', async () => {
  console.log('⏰ Running scheduled stock scrape...');
  try {
    await runScraper();
    console.log('✅ Scheduled scrape completed');
  } catch (error) {
    console.error('❌ Scheduled scrape failed:', error);
  }
}, {
  timezone: "Africa/Lagos",
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 API Docs available at: http://localhost:${PORT}/api`);
});

export default app;
