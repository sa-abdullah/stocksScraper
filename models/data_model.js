// models/data_model.js
import mongoose from 'mongoose'

const stockSchema = new mongoose.Schema({
    // Exact columns from Stanbic website
    symbol: {
        type: String, 
        required: true, 
        index: true,
        uppercase: true,
        trim: true
    }, 
    securityName: {
        type: String, 
        required: true,
        trim: true
    }, 
    open: {
        type: Number,
        required: true,
        min: 0
    },
    high: {
        type: Number,
        required: true,
        min: 0
    },
    low: {
        type: Number,
        required: true,
        min: 0
    },
    close: {
        type: Number,
        required: true,
        min: 0
    },
    change: {
        type: Number, 
        required: true
    }, 
    dailyVolume: {
        type: Number, 
        required: true,
        min: 0
    }, 
    dailyValue: {
        type: Number, 
        required: true,
        min: 0
    },
    // Metadata fields
    scrapedAt: {
        type: Date, 
        default: Date.now, 
        index: true
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
stockSchema.index({ symbol: 1, scrapedAt: -1 });
stockSchema.index({ scrapedAt: -1 });
stockSchema.index({ close: -1 });

// Virtuals for formatting
stockSchema.virtual('formattedClose').get(function () {
  return `₦${this.close.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

stockSchema.virtual('formattedOpen').get(function () {
  return `₦${this.open.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

stockSchema.virtual('formattedHigh').get(function () {
  return `₦${this.high.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

stockSchema.virtual('formattedLow').get(function () {
  return `₦${this.low.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

stockSchema.virtual('formattedChange').get(function () {
  const sign = this.change >= 0 ? '+' : '';
  return `${sign}₦${this.change.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

stockSchema.virtual('formattedVolume').get(function () {
  return this.dailyVolume.toLocaleString('en-NG');
});

stockSchema.virtual('formattedValue').get(function () {
  return `₦${this.dailyValue.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

stockSchema.virtual('changePercent').get(function () {
  if (this.change === 0 || this.close === 0) return 0;
  const previousClose = this.close - this.change;
  if (previousClose === 0) return 0;
  return ((this.change / previousClose) * 100);
});

stockSchema.virtual('formattedChangePercent').get(function () {
  const percent = this.changePercent;
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
});

// Static method to find latest stocks
stockSchema.statics.findLatest = function (limit = 150) {
  return this.aggregate([
    { $sort: { symbol: 1, scrapedAt: -1 } },
    {
      $group: {
        _id: '$symbol',
        latestStock: { $first: '$$ROOT' },
      },
    },
    { $replaceRoot: { newRoot: '$latestStock' } },
    { $limit: limit },
    { $sort: { symbol: 1 } },
  ]);
};

// Static method to get market summary
stockSchema.statics.getMarketSummary = function () {
  return this.aggregate([
    { $sort: { scrapedAt: -1 } },
    { $limit: 200 }, // Get recent records
    {
      $group: {
        _id: null,
        totalStocks: { $sum: 1 },
        totalVolume: { $sum: '$dailyVolume' },
        totalValue: { $sum: '$dailyValue' },
        avgPrice: { $avg: '$close' },
        gainers: {
          $sum: { $cond: [{ $gt: ['$change', 0] }, 1, 0] }
        },
        losers: {
          $sum: { $cond: [{ $lt: ['$change', 0] }, 1, 0] }
        },
        unchanged: {
          $sum: { $cond: [{ $eq: ['$change', 0] }, 1, 0] }
        }
      }
    }
  ]);
};

export default mongoose.model('Stock', stockSchema);