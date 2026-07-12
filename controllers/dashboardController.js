import Transaction from '../models/Transaction.js';
import Borrow from '../models/Borrow.js';
import Lend from '../models/Lend.js';
import SavingsGoal from '../models/SavingsGoal.js';
import Profile from '../models/Profile.js';

export const getDashboardStats = async (req, res) => {
  try {
    const profile = await Profile.findOne() || { monthlyBudget: 2000, savingsGoal: 5000 };
    
    // 1. Total Income & Expenses (All-time and Current Month)
    const allTransactions = await Transaction.find().sort({ date: -1 });
    
    let totalIncome = 0;
    let totalExpense = 0;
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    
    allTransactions.forEach(t => {
      if (t.type === 'income') {
        totalIncome += t.amount;
        if (t.date >= startOfMonth) {
          monthlyIncome += t.amount;
        }
      } else {
        totalExpense += t.amount;
        if (t.date >= startOfMonth) {
          monthlyExpense += t.amount;
        }
      }
    });

    // 2. Savings goals progress
    const savingsGoals = await SavingsGoal.find();
    let totalSavings = 0;
    savingsGoals.forEach(g => {
      totalSavings += g.currentAmount;
    });

    // 3. Borrow records summary
    const borrows = await Borrow.find({ status: 'pending' });
    let totalBorrowed = 0;
    let moneyToPay = 0;
    borrows.forEach(b => {
      totalBorrowed += b.amount;
      moneyToPay += b.remainingAmount;
    });

    // 4. Lend records summary
    const lends = await Lend.find({ status: 'pending' });
    let totalLent = 0;
    let moneyToReceive = 0;
    lends.forEach(l => {
      totalLent += l.amount;
      moneyToReceive += l.remainingAmount;
    });

    // 5. Current Net Balance
    // Net Balance = (Incomes - Expenses) + Borrowed remaining - Lent remaining
    const currentBalance = totalIncome - totalExpense;

    // 6. Recent lists
    const recentTransactions = allTransactions.slice(0, 6);
    
    const recentBorrows = await Borrow.find().sort({ createdAt: -1 }).limit(5);
    const recentLends = await Lend.find().sort({ createdAt: -1 }).limit(5);
    
    // 7. Upcoming payments (Borrow/Lend records with due dates in future, sorted by due dates)
    const today = new Date();
    const upcomingBorrow = await Borrow.find({ status: 'pending', dueDate: { $gte: today } }).sort({ dueDate: 1 }).limit(3);
    const upcomingLend = await Lend.find({ status: 'pending', dueDate: { $gte: today } }).sort({ dueDate: 1 }).limit(3);
    
    const upcomingPayments = [
      ...upcomingBorrow.map(b => ({
        id: b._id,
        type: 'borrow',
        personName: b.personName,
        amount: b.remainingAmount,
        dueDate: b.dueDate,
        title: `Pay ${b.personName}`,
      })),
      ...upcomingLend.map(l => ({
        id: l._id,
        type: 'lend',
        personName: l.personName,
        amount: l.remainingAmount,
        dueDate: l.dueDate,
        title: `Collect from ${l.personName}`,
      }))
    ].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 5);

    // 8. Monthly Cash Flow (Last 6 Months data for chart)
    const cashFlowData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const year = d.getFullYear();
      const month = d.getMonth();
      
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      
      const monthTransactions = await Transaction.find({
        date: { $gte: start, $lte: end }
      });
      
      let inc = 0;
      let exp = 0;
      monthTransactions.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else exp += t.amount;
      });
      
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      cashFlowData.push({
        month: monthNames[month],
        income: inc,
        expense: exp,
        savings: inc - exp > 0 ? inc - exp : 0
      });
    }

    // 9. Category Breakdown for current month expenses
    const categoryTotals = {};
    const currentMonthExpenses = allTransactions.filter(t => t.type === 'expense' && t.date >= startOfMonth);
    
    currentMonthExpenses.forEach(t => {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });

    const categoryBreakdown = Object.keys(categoryTotals).map(cat => ({
      name: cat,
      value: categoryTotals[cat],
    })).sort((a, b) => b.value - a.value);

    // 10. Budget progress
    const budgetProgress = {
      budget: profile.monthlyBudget || 2000,
      spent: monthlyExpense,
      percentage: profile.monthlyBudget ? Math.min(100, Math.round((monthlyExpense / profile.monthlyBudget) * 100)) : 0,
    };

    res.json({
      currentBalance,
      totalIncome,
      totalExpense,
      monthlyIncome,
      monthlyExpense,
      totalSavings,
      totalBorrowed,
      totalLent,
      moneyToPay,
      moneyToReceive,
      budgetProgress,
      recentTransactions,
      recentBorrows,
      recentLends,
      upcomingPayments,
      cashFlowData,
      categoryBreakdown
    });
  } catch (error) {
    res.status(500).json({ message: 'Error calculating dashboard stats', error: error.message });
  }
};
