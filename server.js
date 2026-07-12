import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Import Routes
import profileRoutes from './routes/profileRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import borrowRoutes from './routes/borrowRoutes.js';
import lendRoutes from './routes/lendRoutes.js';
import savingsRoutes from './routes/savingsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

// Import Models for Seeding
import Profile from './models/Profile.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expense_manager';

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection & Single Profile Seeding
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('Connected successfully to MongoDB.');
    
    // Seed default profile if not exists
    try {
      const profileCount = await Profile.countDocuments();
      if (profileCount === 0) {
        await Profile.create({
          name: 'Asim Maji',
          currency: '$',
          monthlyBudget: 2000,
          budgetAlertPercentage: 80,
          savingsGoal: 5000,
          theme: 'dark'
        });
        console.log('Default user profile successfully seeded.');
      }
    } catch (seedErr) {
      console.error('Failed to seed default profile:', seedErr);
    }
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });

// API Routes
app.use('/api/profile', profileRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/borrow', borrowRoutes);
app.use('/api/lend', lendRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Health check / welcome endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Personal Finance & Expense Manager API' });
});

// Centralized error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'An internal server error occurred',
    error: process.env.NODE_ENV === 'development' ? err.stack : {}
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
