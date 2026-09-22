import { buildFinancialContext } from '../utils/contextBuilder.js';
import { callGeminiAPI } from '../services/geminiService.js';
import axios from 'axios';

// Rules-based fallback chat assistant when Gemini API key fails/is-quota-limited
const generateFallbackChatResponse = (context, userMessage) => {
  const currency = context.profile?.currency || '₹';
  const monthlyBudget = context.profile?.monthlyBudget || 2000;
  const monthlyExpense = context.summary?.monthlyExpense || 0;
  const monthlyIncome = context.summary?.monthlyIncome || 0;
  const netBalance = context.summary?.totalBalance ?? context.summary?.currentBalance ?? 0;
  const remainingBudget = Math.max(0, monthlyBudget - monthlyExpense);
  const daysLeft = context.daysLeftInMonth || 15;
  const dailyLimit = daysLeft > 0 ? (remainingBudget / daysLeft).toFixed(2) : '0.00';

  const msg = userMessage.toLowerCase();

  // 1. Purchase Affordability ("Can I buy X?")
  if (msg.includes('can i buy') || msg.includes('can i afford') || msg.includes('should i spend') || msg.includes('purchase')) {
    // Extract potential amount from message (e.g., 2500, ₹2500, $2500)
    const match = msg.match(/\d+([.,]\d+)?/);
    const amount = match ? parseFloat(match[0].replace(',', '')) : null;

    if (amount) {
      const newRemaining = remainingBudget - amount;
      const newDailyLimit = daysLeft > 0 ? Math.max(0, newRemaining / daysLeft).toFixed(2) : '0.00';

      if (amount > remainingBudget) {
        return `### ⚠️ Purchase Verdict: **Not Recommended**
- **Requested Item Cost**: ${currency}${amount.toFixed(2)}
- **Remaining Budget**: ${currency}${remainingBudget.toFixed(2)}
- **Deficit Risk**: Making this purchase now would cause a **budget deficit of ${currency}${(amount - remainingBudget).toFixed(2)}** with ${daysLeft} days remaining.

**Responsible Recommendation**: 
Consider postponing this purchase until next month, or create a dedicated goal in the **Budgets & Savings** page to set aside funds gradually!`;
      } else if (newRemaining < monthlyBudget * 0.15) {
        return `### ⚠️ Purchase Verdict: **Caution Advised**
- **Requested Item Cost**: ${currency}${amount.toFixed(2)}
- **Remaining Budget**: ${currency}${remainingBudget.toFixed(2)} -> **${currency}${newRemaining.toFixed(2)}** after purchase
- **Impact on Daily Spend**: Your daily spending limit drops from **${currency}${dailyLimit}** to **${currency}${newDailyLimit}/day** for the remaining ${daysLeft} days.

**Responsible Recommendation**: 
You can technically afford it, but it will leave little emergency margin. Make sure all essential bills (groceries, utilities, rent) are covered first!`;
      } else {
        return `### ✅ Purchase Verdict: **Affordable**
- **Requested Item Cost**: ${currency}${amount.toFixed(2)}
- **Remaining Budget After Purchase**: ${currency}${newRemaining.toFixed(2)}
- **New Safe Daily Limit**: ${currency}${newDailyLimit}/day across the remaining ${daysLeft} days.

**Responsible Recommendation**: 
This purchase fits comfortably within your monthly budget allowance without risking overspending!`;
      }
    }
  }

  // 2. App Function Queries
  if (msg.includes('how to add') || msg.includes('add transaction') || msg.includes('new transaction') || msg.includes('log expense')) {
    return `### 📝 How to Add a Transaction:
1. Navigate to the **Transactions** page from the left sidebar.
2. Click the **"+ Add Transaction"** button in the top right.
3. Choose whether it is an **Expense** or **Income**.
4. Enter the **Amount**, select a **Category** (e.g., Food, Transport, Housing, Salary), and pick the **Date**.
5. Optionally add a description or notes, then click **"Save Transaction"**.`;
  }

  if (msg.includes('how to set budget') || msg.includes('create goal') || msg.includes('savings goal') || msg.includes('budget')) {
    return `### 🎯 How to Manage Budgets & Savings:
1. Go to the **Budgets & Savings** page in the sidebar.
2. **Monthly Budget**: Click "Edit Budget" to set your overall monthly spending limit.
3. **Category Budgets**: Assign dedicated allowances to categories like Groceries or Entertainment.
4. **Savings Goals**: Click **"+ New Goal"**, specify a target name (e.g., "Emergency Fund"), target amount, and due date. You can add deposits anytime to track completion percentage!`;
  }

  if (msg.includes('borrow') || msg.includes('lend') || msg.includes('debt') || msg.includes('loan')) {
    return `### 🤝 How Borrow & Lend Tracking Works:
1. Head to the **Borrow & Lend** page from the sidebar.
2. **Borrow Tab**: Track money you borrowed from friends or banks. Enter the lender's name, total amount, and due date. Log repayments as you clear the debt.
3. **Lend Tab**: Track money you lent to others. Enter the borrower's name and amount. Record incoming installments until the status marks "Settled".`;
  }

  if (msg.includes('calendar')) {
    return `### 📅 How to Use the Calendar View:
1. Open the **Calendar** page from the sidebar.
2. View your entire month at a glance with color-coded daily income and expense totals.
3. Click on any individual date on the calendar to see all transactions logged on that specific day.`;
  }

  if (msg.includes('report') || msg.includes('analytics') || msg.includes('export') || msg.includes('chart')) {
    return `### 📊 How to View Reports & Analytics:
1. Navigate to the **Reports** page from the sidebar.
2. Explore interactive spending breakdown charts, category distribution percentages, and cash flow trends.
3. Use the **Export** button to download your financial data for your records or tax planning.`;
  }

  if (msg.includes('currency') || msg.includes('profile') || msg.includes('setting') || msg.includes('theme')) {
    return `### ⚙️ How to Update Profile & Settings:
1. Click on **Profile** or the settings icon in the sidebar.
2. Update your display name and change your default **Currency Symbol** (₹, $, €, £, etc.).
3. Configure your monthly budget limit and budget alert threshold percentage.
4. Toggle between **Dark Mode** and **Light Mode** anytime.`;
  }

  // 3. Expense Analysis
  if (msg.includes('analyze') || msg.includes('expense') || msg.includes('spend')) {
    let breakdown = '';
    const categories = context.expenseDetails?.categoriesBreakdownCurrentMonth || {};
    const catKeys = Object.keys(categories);
    if (catKeys.length > 0) {
      breakdown = '\n\n**Category Breakdown:**\n' + catKeys.map(k => `- **${k}**: ${currency}${categories[k].toFixed(2)}`).join('\n');
    }
    return `### 📊 Current Month's Expense Analysis:
- **Total Spent**: ${currency}${monthlyExpense.toFixed(2)}
- **Monthly Budget**: ${currency}${monthlyBudget.toFixed(2)}
- **Remaining Budget**: ${currency}${remainingBudget.toFixed(2)}${breakdown}

You have **${daysLeft} days** left this month. To finish safely within budget, your recommended daily limit is **${currency}${dailyLimit}**.`;
  }

  // 4. Savings
  if (msg.includes('save') || msg.includes('saving') || msg.includes('goal')) {
    if (context.savingsGoals && context.savingsGoals.length > 0) {
      const goalsList = context.savingsGoals.map(g => `- **${g.title}**: ${currency}${g.currentAmount} / ${currency}${g.targetAmount} (${g.percentage}% complete)`).join('\n');
      return `### 🎯 Active Savings Goals:
${goalsList}

**Responsible Tip**: Automating savings right when income is received is the most reliable way to achieve your targets!`;
    }
    return `You don't have any active savings goals set up yet. Go to **Budgets & Savings** in the sidebar and click **"+ New Goal"** to start building an Emergency Fund or target milestone!`;
  }

  // 5. Daily limit
  if (msg.includes('limit') || msg.includes('daily') || msg.includes('how much')) {
    return `### 💡 Daily Spending Recommendation:
- **Remaining Budget**: ${currency}${remainingBudget.toFixed(2)}
- **Days Remaining**: ${daysLeft} days
- **Recommended Daily Limit**: **${currency}${dailyLimit}** per day

Staying under this daily number guarantees you will finish the month with a surplus!`;
  }

  // 6. Balance & Cash flow
  if (msg.includes('balance') || msg.includes('income') || msg.includes('net')) {
    return `### 💵 Balance & Cash Flow Summary:
- **Total Income**: ${currency}${monthlyIncome.toFixed(2)}
- **Total Expenses**: ${currency}${monthlyExpense.toFixed(2)}
- **Current Net Balance**: ${currency}${netBalance.toFixed(2)}

Your net cash flow is **${monthlyIncome >= monthlyExpense ? 'Positive ✅' : 'Negative ⚠️'}** for this billing cycle.`;
  }

  // 7. Forecast
  if (msg.includes('predict') || msg.includes('forecast')) {
    const endOfMonthSpent = (monthlyExpense / (Math.max(1, 30 - daysLeft))) * 30;
    const overspend = endOfMonthSpent - monthlyBudget;
    if (overspend > 0) {
      return `### ⚠️ End-of-Month Forecast:
- **Projected End-of-Month Spending**: ${currency}${endOfMonthSpent.toFixed(2)}
- **Monthly Budget**: ${currency}${monthlyBudget.toFixed(2)}
- **Projected Deficit**: **${currency}${overspend.toFixed(2)}**

**Actionable Advice**: Reduce non-essential dining and entertainment for the next ${daysLeft} days to balance your cash flow!`;
    }
    return `### 🎉 End-of-Month Forecast:
- **Projected Spending**: ${currency}${endOfMonthSpent.toFixed(2)}
- **Monthly Budget**: ${currency}${monthlyBudget.toFixed(2)}
- **Projected Surplus**: **${currency}${(monthlyBudget - endOfMonthSpent).toFixed(2)}**

You are pacing excellently! Consider directing this anticipated surplus toward your savings goals.`;
  }

  // General fallback text
  return `Hello! As your personal **Finance Coach & App Guide**, I can assist you responsibly with:
- **Expense Analysis & Audits**: Ask *"Analyze my expenses"* or *"Where am I overspending?"*
- **Purchase Checks**: Ask *"Can I afford a ₹1,500 purchase today?"*
- **Daily Spending Limits**: Ask *"How much can I safely spend today?"*
- **App Instructions**: Ask how to add transactions, manage savings goals, use borrow/lend, view calendar, or export reports!`;
};

// Chat with Gemini Assistant
export const chatWithAI = async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'User message is required.' });
    }

    // 1. Gather database context
    const context = await buildFinancialContext();

    try {
      // 2. Call Gemini API
      const responseText = await callGeminiAPI(context, history, message);
      res.json({ response: responseText });
    } catch (apiErr) {
      console.warn('Gemini API call failed in chat, generating intelligent fallback response:', apiErr.message);
      const fallbackResponse = generateFallbackChatResponse(context, message);
      res.json({ response: fallbackResponse });
    }
  } catch (error) {
    console.error('Error in AI Chat controller:', error);
    res.status(500).json({ message: error.message || 'An error occurred during AI processing.' });
  }
};

// Get Dashboard Insights (輕量級 JSON)
export const getAIInsights = async (req, res) => {
  try {
    // 1. Gather database context
    const context = await buildFinancialContext();
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(200).json(getFallbackInsights(context));
    }

    // 2. Query Gemini for structured JSON insights
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
    
    const systemPrompt = `You are a financial analyst. Analyze this financial database summary and output a clean JSON object containing specific fields.
Database summary:
${JSON.stringify(context, null, 2)}

You MUST output ONLY a valid JSON block matching this exact structure, with no markdown wrappers (like \`\`\`json), no trailing commas, and no additional explanatory text:
{
  "financialTip": "a personalized, data-driven tip based on current transactions",
  "dailyLimitAdvice": "amount they can safely spend daily for the rest of the month",
  "budgetHealthScore": 85, // integer 0-100 based on spent vs budget
  "savingsScore": 60, // integer 0-100 based on savings goal progress
  "monthlyPrediction": "EOM prediction, e.g., 'Will end with ₹4,000 surplus' or 'High risk of overspending by ₹1,500'",
  "cashFlowStatus": "description of cash flow, e.g., 'Positive cash flow' or 'Deficit due to rent'",
  "riskLevel": "Low", // 'Low', 'Medium', or 'High'
  "overspendingCategory": "name of category, or 'None'"
}`;

    try {
      const response = await axios.post(endpoint, {
        contents: [{ role: 'user', parts: [{ text: 'Generate insights' }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (responseText) {
        const insights = JSON.parse(responseText.trim());
        return res.json(insights);
      }
      
      throw new Error('Empty response from Gemini');
    } catch (apiErr) {
      console.error('Failed to get insights from Gemini, using fallback:', apiErr.message);
      return res.json(getFallbackInsights(context));
    }
  } catch (error) {
    console.error('Error in AI Insights controller:', error);
    res.status(500).json({ message: 'Error retrieving AI insights' });
  }
};

// Fallback algorithm to compute insights directly if Gemini is offline
const getFallbackInsights = (context) => {
  const currency = context.profile.currency || '₹';
  const monthlyExpense = context.summary.monthlyExpense || 0;
  const monthlyBudget = context.profile.monthlyBudget || 2000;
  const remainingBudget = context.summary.remainingBudget || 0;
  const daysLeft = context.daysLeftInMonth || 15;

  const budgetHealthScore = monthlyBudget ? Math.max(0, 100 - Math.round((monthlyExpense / monthlyBudget) * 100)) : 100;
  const dailyLimit = daysLeft > 0 ? (remainingBudget / daysLeft).toFixed(2) : '0.00';
  
  // Calculate average savings goal percentage
  let savingsScore = 0;
  if (context.savingsGoals && context.savingsGoals.length > 0) {
    const totalGoalPercent = context.savingsGoals.reduce((sum, g) => sum + g.percentage, 0);
    savingsScore = Math.min(100, Math.round(totalGoalPercent / context.savingsGoals.length));
  } else {
    savingsScore = 50; // default
  }

  const isOverspent = monthlyExpense > monthlyBudget;

  return {
    financialTip: isOverspent 
      ? `You have exceeded your monthly budget. Pause non-essential shopping.` 
      : `You have ${currency}${remainingBudget.toFixed(2)} remaining. Spend under ${currency}${dailyLimit} per day to stay on target.`,
    dailyLimitAdvice: `${currency}${dailyLimit} per day`,
    budgetHealthScore,
    savingsScore,
    monthlyPrediction: isOverspent 
      ? `Overspending by ${currency}${(monthlyExpense - monthlyBudget).toFixed(2)}` 
      : `Estimated EOM surplus of ${currency}${remainingBudget.toFixed(2)}`,
    cashFlowStatus: context.summary.totalBalance >= 0 ? "Positive Cash Flow" : "Negative Cash Flow",
    riskLevel: isOverspent ? "High" : budgetHealthScore < 20 ? "Medium" : "Low",
    overspendingCategory: isOverspent ? "General" : "None"
  };
};
