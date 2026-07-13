import { buildFinancialContext } from '../utils/contextBuilder.js';
import { callGeminiAPI } from '../services/geminiService.js';
import axios from 'axios';

// Rules-based fallback chat assistant when Gemini API key fails/is-quota-limited
const generateFallbackChatResponse = (context, userMessage) => {
  const currency = context.profile?.currency || '$';
  const monthlyBudget = context.profile?.monthlyBudget || 2000;
  const monthlyExpense = context.summary?.monthlyExpense || 0;
  const monthlyIncome = context.summary?.monthlyIncome || 0;
  const netBalance = context.summary?.currentBalance || 0;
  const remainingBudget = Math.max(0, monthlyBudget - monthlyExpense);
  const daysLeft = context.daysLeftInMonth || 15;
  const dailyLimit = daysLeft > 0 ? (remainingBudget / daysLeft).toFixed(2) : '0.00';

  const msg = userMessage.toLowerCase();

  if (msg.includes('analyze') || msg.includes('expense') || msg.includes('spend')) {
    let breakdown = '';
    if (context.categoryBreakdown && context.categoryBreakdown.length > 0) {
      breakdown = '\n\n**Category Breakdown:**\n' + context.categoryBreakdown.map(cat => `- **${cat.name}**: ${currency}${cat.value.toFixed(2)}`).join('\n');
    }
    return `Here is a breakdown of your current month's expenses:
- **Total Spent**: ${currency}${monthlyExpense.toFixed(2)}
- **Monthly Budget**: ${currency}${monthlyBudget.toFixed(2)}
- **Remaining Budget**: ${currency}${remainingBudget.toFixed(2)}${breakdown}

You have **${daysLeft} days** left in this calendar month. To stay within budget, I suggest a daily spending limit of **${currency}${dailyLimit}**.`;
  }

  if (msg.includes('save') || msg.includes('saving') || msg.includes('goal')) {
    if (context.savingsGoals && context.savingsGoals.length > 0) {
      const goalsList = context.savingsGoals.map(g => `- **${g.title}**: ${currency}${g.currentAmount} / ${currency}${g.targetAmount} (${g.percentage}% complete)`).join('\n');
      return `Here are your active savings goals:
${goalsList}

**Tip**: Consider setting up an automatic transfer of 10-15% of your Freelance/Salary income right when it lands to keep these targets moving!`;
    }
    return `You don't have any active savings goals set up yet. You can create a new goal in the **Budgets & Savings** page. Having a specific target (like an Emergency Fund or New Laptop) makes saving much easier!`;
  }

  if (msg.includes('limit') || msg.includes('daily') || msg.includes('how much')) {
    return `To successfully stay within your monthly budget of **${currency}${monthlyBudget}**:
- **Spent so far**: ${currency}${monthlyExpense.toFixed(2)}
- **Remaining budget**: ${currency}${remainingBudget.toFixed(2)}
- **Days remaining**: ${daysLeft} days

Your recommended daily spending limit is **${currency}${dailyLimit}** per day. Avoiding non-essential shopping for the next few days will help secure this budget!`;
  }

  if (msg.includes('balance') || msg.includes('income') || msg.includes('net')) {
    return `Here is your current balance summary:
- **Total Income**: ${currency}${monthlyIncome.toFixed(2)}
- **Total Expenses**: ${currency}${monthlyExpense.toFixed(2)}
- **Current Net Balance**: ${currency}${netBalance.toFixed(2)}

Your cash flow is currently **${monthlyIncome >= monthlyExpense ? 'Positive' : 'Negative'}** for this month.`;
  }

  if (msg.includes('predict') || msg.includes('forecast')) {
    const endOfMonthSpent = (monthlyExpense / (30 - daysLeft || 1)) * 30;
    const overspend = endOfMonthSpent - monthlyBudget;
    if (overspend > 0) {
      return `Based on your current spending rate this month:
- **Projected End-of-Month Spent**: ${currency}${endOfMonthSpent.toFixed(2)}
- **Budget**: ${currency}${monthlyBudget.toFixed(2)}
- **Alert**: You are on track to **overspend your budget by ${currency}${overspend.toFixed(2)}**. I recommend reducing variable expenses like Dining Out and Shopping immediately to normalize your cash flow.`;
    }
    return `Great news! Based on your current spending pace:
- **Projected End-of-Month Spent**: ${currency}${endOfMonthSpent.toFixed(2)}
- **Budget**: ${currency}${monthlyBudget.toFixed(2)}
- **Forecast**: You are on track to finish the month with a **surplus of ${currency}${(monthlyBudget - endOfMonthSpent).toFixed(2)}**! Keep up the excellent budgeting!`;
  }

  // General fallback text
  return `Hi! As your offline AI Finance Coach, I analyzed your records:
- **Net Balance**: ${currency}${netBalance.toFixed(2)}
- **Month's Expenses**: ${currency}${monthlyExpense.toFixed(2)} / ${currency}${monthlyBudget.toFixed(2)}
- **Recommended Daily Limit**: ${currency}${dailyLimit} (for the remaining ${daysLeft} days)

Ask me about your **expenses**, **savings goals**, **daily limits**, **balance prediction**, or request a **financial summary**!`;
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
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
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
