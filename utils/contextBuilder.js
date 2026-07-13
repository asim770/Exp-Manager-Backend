import Profile from '../models/Profile.js';
import Transaction from '../models/Transaction.js';
import Borrow from '../models/Borrow.js';
import Lend from '../models/Lend.js';
import SavingsGoal from '../models/SavingsGoal.js';

export const buildFinancialContext = async () => {
  try {
    // 1. Fetch Profile
    const profile = await Profile.findOne() || { name: 'Asim Maji', currency: '₹', monthlyBudget: 2000, budgetAlertPercentage: 80 };

    // 2. Setup dates
    const now = new Date();
    
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // 3. Transactions Query
    const transactions = await Transaction.find().sort({ date: -1 });
    
    let totalIncome = 0;
    let totalExpense = 0;
    let monthlyIncome = 0;
    let monthlyExpense = 0;
    let weeklyExpense = 0;
    let dailyExpense = 0;
    
    const expenseCategories = {};
    const largestExpenses = [];
    const recurringExpenses = [];
    
    transactions.forEach(t => {
      const amt = t.amount;
      const tDate = new Date(t.date);
      
      if (t.type === 'income') {
        totalIncome += amt;
        if (tDate >= startOfMonth) {
          monthlyIncome += amt;
        }
      } else {
        totalExpense += amt;
        if (tDate >= startOfMonth) {
          monthlyExpense += amt;
          expenseCategories[t.category] = (expenseCategories[t.category] || 0) + amt;
        }
        if (tDate >= startOfWeek) {
          weeklyExpense += amt;
        }
        if (tDate >= startOfDay) {
          dailyExpense += amt;
        }
        
        // Populate largest expenses
        largestExpenses.push({ category: t.category, amount: amt, notes: t.notes, date: t.date });
        
        if (t.isRecurring) {
          recurringExpenses.push({ category: t.category, amount: amt, interval: t.recurringInterval, notes: t.notes });
        }
      }
    });

    // Sort largest expenses
    largestExpenses.sort((a, b) => b.amount - a.amount);
    const topLargestExpenses = largestExpenses.slice(0, 5);

    // 4. Borrow records
    const borrows = await Borrow.find();
    let totalBorrowed = 0;
    let outstandingBorrowed = 0;
    const upcomingDebts = [];
    
    borrows.forEach(b => {
      totalBorrowed += b.amount;
      if (b.status === 'pending') {
        outstandingBorrowed += b.remainingAmount;
        upcomingDebts.push({
          personName: b.personName,
          remainingAmount: b.remainingAmount,
          dueDate: b.dueDate,
          notes: b.notes
        });
      }
    });
    upcomingDebts.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // 5. Lend records
    const lends = await Lend.find();
    let totalLent = 0;
    let outstandingReceivables = 0;
    const upcomingCollections = [];
    
    lends.forEach(l => {
      totalLent += l.amount;
      if (l.status === 'pending') {
        outstandingReceivables += l.remainingAmount;
        upcomingCollections.push({
          personName: l.personName,
          remainingAmount: l.remainingAmount,
          dueDate: l.dueDate,
          notes: l.notes
        });
      }
    });
    upcomingCollections.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    // 6. Savings Goals
    const savingsGoals = await SavingsGoal.find();
    let totalSavings = 0;
    const goalsSummary = [];
    
    savingsGoals.forEach(g => {
      totalSavings += g.currentAmount;
      goalsSummary.push({
        title: g.title,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        dueDate: g.dueDate,
        percentage: g.targetAmount ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0
      });
    });

    // Calculate budget utilization
    const remainingBudget = Math.max(0, profile.monthlyBudget - monthlyExpense);
    const budgetUtilization = profile.monthlyBudget ? Math.round((monthlyExpense / profile.monthlyBudget) * 100) : 0;
    
    // Remaining days in current month
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = lastDayOfMonth - now.getDate() + 1;

    return {
      profile: {
        name: profile.name,
        currency: profile.currency,
        monthlyBudget: profile.monthlyBudget,
        budgetAlertPercentage: profile.budgetAlertPercentage,
        theme: profile.theme
      },
      currentDate: now.toDateString(),
      daysLeftInMonth: daysLeft,
      summary: {
        totalBalance: totalIncome - totalExpense,
        totalIncome,
        totalExpense,
        monthlyIncome,
        monthlyExpense,
        weeklyExpense,
        dailyExpense,
        totalSavings,
        remainingBudget,
        budgetUtilizationPercentage: budgetUtilization
      },
      expenseDetails: {
        categoriesBreakdownCurrentMonth: expenseCategories,
        largestExpensesThisPeriod: topLargestExpenses,
        recurringExpenses
      },
      borrowSummary: {
        totalBorrowed,
        outstandingBorrowed,
        upcomingDebts: upcomingDebts.slice(0, 3)
      },
      lendSummary: {
        totalLent,
        outstandingReceivables,
        upcomingCollections: upcomingCollections.slice(0, 3)
      },
      savingsGoals: goalsSummary,
      recentTransactions: transactions.slice(0, 10).map(t => ({
        type: t.type,
        category: t.category,
        amount: t.amount,
        notes: t.notes,
        date: t.date
      }))
    };
  } catch (error) {
    console.error('Error building financial context:', error);
    throw error;
  }
};
