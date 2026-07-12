import Transaction from '../models/Transaction.js';
import Profile from '../models/Profile.js';
import Notification from '../models/Notification.js';

// Get all transactions with search, sorting and filtering
export const getTransactions = async (req, res) => {
  try {
    const { type, category, startDate, endDate, search, sortBy } = req.query;
    
    let query = {};
    
    if (type) {
      query.type = type;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }
    
    if (search) {
      query.$or = [
        { category: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
      ];
    }
    
    let sortOptions = { date: -1 }; // default: newest first
    if (sortBy) {
      if (sortBy === 'date_asc') sortOptions = { date: 1 };
      else if (sortBy === 'date_desc') sortOptions = { date: -1 };
      else if (sortBy === 'amount_asc') sortOptions = { amount: 1 };
      else if (sortBy === 'amount_desc') sortOptions = { amount: -1 };
    }
    
    const transactions = await Transaction.find(query).sort(sortOptions);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transactions', error: error.message });
  }
};

// Check budget limit helper
const checkBudgetLimit = async (addedAmount) => {
  try {
    const profile = await Profile.findOne();
    if (!profile || !profile.monthlyBudget) return;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    // Sum current month expenses
    const expenses = await Transaction.aggregate([
      {
        $match: {
          type: 'expense',
          date: { $gte: startOfMonth, $lt: endOfMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const currentTotal = (expenses[0]?.total || 0) + addedAmount;
    const budget = profile.monthlyBudget;
    const warningLimit = budget * (profile.budgetAlertPercentage / 100);

    // Check if we need to issue warnings
    if (currentTotal >= budget) {
      // Check if we already have an overspent notification for this month
      const existing = await Notification.findOne({
        type: 'budget',
        title: 'Monthly Budget Exceeded',
        date: { $gte: startOfMonth, $lt: endOfMonth }
      });
      if (!existing) {
        await Notification.create({
          title: 'Monthly Budget Exceeded',
          message: `Your total spending ($${currentTotal.toFixed(2)}) has exceeded your set monthly budget of $${budget.toFixed(2)}!`,
          type: 'budget',
        });
      }
    } else if (currentTotal >= warningLimit) {
      // Warning threshold crossed
      const existing = await Notification.findOne({
        type: 'budget',
        title: 'Budget Warning Threshold Reached',
        date: { $gte: startOfMonth, $lt: endOfMonth }
      });
      if (!existing) {
        await Notification.create({
          title: 'Budget Warning Threshold Reached',
          message: `You have spent $${currentTotal.toFixed(2)} (${profile.budgetAlertPercentage}% of your $${budget.toFixed(2)} budget).`,
          type: 'budget',
        });
      }
    }
  } catch (err) {
    console.error('Error checking budget threshold:', err);
  }
};

// Create a transaction
export const createTransaction = async (req, res) => {
  try {
    const { type, category, amount, date, notes, receiptUrl, isRecurring, recurringInterval } = req.body;
    
    if (!type || !category || !amount) {
      return res.status(400).json({ message: 'Type, category, and amount are required' });
    }
    
    const transaction = await Transaction.create({
      type,
      category,
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      notes,
      receiptUrl,
      isRecurring: !!isRecurring,
      recurringInterval: recurringInterval || 'none',
    });
    
    // Check budget warnings for expenses
    if (type === 'expense') {
      await checkBudgetLimit(Number(amount));
    }
    
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Error creating transaction', error: error.message });
  }
};

// Update a transaction
export const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, category, amount, date, notes, receiptUrl, isRecurring, recurringInterval } = req.body;
    
    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    
    const oldAmount = transaction.amount;
    const oldType = transaction.type;
    
    if (type !== undefined) transaction.type = type;
    if (category !== undefined) transaction.category = category;
    if (amount !== undefined) transaction.amount = Number(amount);
    if (date !== undefined) transaction.date = new Date(date);
    if (notes !== undefined) transaction.notes = notes;
    if (receiptUrl !== undefined) transaction.receiptUrl = receiptUrl;
    if (isRecurring !== undefined) transaction.isRecurring = !!isRecurring;
    if (recurringInterval !== undefined) transaction.recurringInterval = recurringInterval;
    
    await transaction.save();
    
    // Recalculate budget warnings if amount or type was updated to expense
    if (transaction.type === 'expense') {
      const addedAmount = transaction.amount - (oldType === 'expense' ? oldAmount : 0);
      if (addedAmount > 0) {
        await checkBudgetLimit(addedAmount);
      }
    }
    
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Error updating transaction', error: error.message });
  }
};

// Delete a transaction
export const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findByIdAndDelete(id);
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.json({ message: 'Transaction deleted successfully', transaction });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting transaction', error: error.message });
  }
};
