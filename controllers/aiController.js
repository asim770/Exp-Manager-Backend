import { buildFinancialContext } from '../utils/contextBuilder.js';
import { callGeminiAPI } from '../services/geminiService.js';
import axios from 'axios';

// Chat with Gemini Assistant
export const chatWithAI = async (req, res) => {
  try {
    const { message, history } = req.body;
    if (!message) {
      return res.status(400).json({ message: 'User message is required.' });
    }

    // 1. Gather database context
    const context = await buildFinancialContext();

    // 2. Call Gemini
    const responseText = await callGeminiAPI(context, history, message);

    res.json({ response: responseText });
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
