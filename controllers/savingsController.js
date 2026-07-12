import SavingsGoal from '../models/SavingsGoal.js';
import Notification from '../models/Notification.js';

// Get savings goals
export const getSavingsGoals = async (req, res) => {
  try {
    const goals = await SavingsGoal.find().sort({ dueDate: 1 });
    res.json(goals);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving savings goals', error: error.message });
  }
};

// Create savings goal
export const createSavingsGoal = async (req, res) => {
  try {
    const { title, targetAmount, currentAmount, dueDate, notes } = req.body;
    
    if (!title || !targetAmount || !dueDate) {
      return res.status(400).json({ message: 'Title, target amount, and due date are required' });
    }
    
    const goal = await SavingsGoal.create({
      title,
      targetAmount: Number(targetAmount),
      currentAmount: currentAmount ? Number(currentAmount) : 0,
      dueDate: new Date(dueDate),
      notes,
      contributions: currentAmount ? [{ date: new Date(), amount: Number(currentAmount), notes: 'Initial savings' }] : [],
    });
    
    // Check if goal met instantly
    if (goal.currentAmount >= goal.targetAmount) {
      await Notification.create({
        title: 'Savings Goal Achieved!',
        message: `Congratulations! You have reached your savings goal of $${Number(targetAmount).toFixed(2)} for "${title}".`,
        type: 'savings',
      });
    }
    
    res.status(201).json(goal);
  } catch (error) {
    res.status(500).json({ message: 'Error creating savings goal', error: error.message });
  }
};

// Update savings goal
export const updateSavingsGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, targetAmount, currentAmount, dueDate, notes } = req.body;
    
    const goal = await SavingsGoal.findById(id);
    if (!goal) {
      return res.status(404).json({ message: 'Savings goal not found' });
    }
    
    if (title !== undefined) goal.title = title;
    if (targetAmount !== undefined) goal.targetAmount = Number(targetAmount);
    if (currentAmount !== undefined) goal.currentAmount = Number(currentAmount);
    if (dueDate !== undefined) goal.dueDate = new Date(dueDate);
    if (notes !== undefined) goal.notes = notes;
    
    await goal.save();
    res.json(goal);
  } catch (error) {
    res.status(500).json({ message: 'Error updating savings goal', error: error.message });
  }
};

// Add contribution to a savings goal
export const addContribution = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes, date } = req.body;
    
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid contribution amount is required' });
    }
    
    const goal = await SavingsGoal.findById(id);
    if (!goal) {
      return res.status(404).json({ message: 'Savings goal not found' });
    }
    
    const contribAmt = Number(amount);
    const wasAchieved = goal.currentAmount >= goal.targetAmount;
    
    goal.currentAmount += contribAmt;
    goal.contributions.push({
      date: date ? new Date(date) : new Date(),
      amount: contribAmt,
      notes: notes || 'Goal contribution',
    });
    
    await goal.save();
    
    // Check achievements
    if (goal.currentAmount >= goal.targetAmount && !wasAchieved) {
      await Notification.create({
        title: 'Savings Goal Achieved!',
        message: `Congratulations! You have reached your savings goal of $${goal.targetAmount.toFixed(2)} for "${goal.title}".`,
        type: 'savings',
      });
    }
    
    res.json(goal);
  } catch (error) {
    res.status(500).json({ message: 'Error adding contribution', error: error.message });
  }
};

// Delete savings goal
export const deleteSavingsGoal = async (req, res) => {
  try {
    const { id } = req.params;
    const goal = await SavingsGoal.findByIdAndDelete(id);
    if (!goal) {
      return res.status(404).json({ message: 'Savings goal not found' });
    }
    res.json({ message: 'Savings goal deleted successfully', goal });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting savings goal', error: error.message });
  }
};
