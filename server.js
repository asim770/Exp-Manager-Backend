import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

// Import Routes
import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import borrowRoutes from './routes/borrowRoutes.js';
import lendRoutes from './routes/lendRoutes.js';
import savingsRoutes from './routes/savingsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import aiRoutes from './routes/ai.js';

// Import Middleware
import { authenticateUser } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected successfully to MongoDB.');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });

// Public Auth Routes
app.use('/api/auth', authRoutes);

// Protected API Routes (scoped to authenticated user)
app.use('/api/profile', authenticateUser, profileRoutes);
app.use('/api/transactions', authenticateUser, transactionRoutes);
app.use('/api/borrow', authenticateUser, borrowRoutes);
app.use('/api/lend', authenticateUser, lendRoutes);
app.use('/api/savings', authenticateUser, savingsRoutes);
app.use('/api/notifications', authenticateUser, notificationRoutes);
app.use('/api/dashboard', authenticateUser, dashboardRoutes);
app.use('/api/ai', authenticateUser, aiRoutes);

// Health check / welcome endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Personal Finance & Expense Manager API with Google Auth is running' });
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
