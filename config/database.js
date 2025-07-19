// config/database.js
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    
    console.log(`🚀 MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  }
};

export default connectDB;
