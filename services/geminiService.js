import axios from 'axios';

export const callGeminiAPI = async (context, chatHistory, userMessage) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // 1. Build the system prompt with context details
  const systemPrompt = `You are a premium, professional, friendly, and practical personal financial advisor named "Antigravity Finance Coach".
You are helping the user manage their personal wealth and expenses.

Here is the user's current live financial database context:
${JSON.stringify(context, null, 2)}

Instructions:
- Base your answers on the actual data provided. Avoid generic boilerplate advice unless it directly supports your analysis of their numbers.
- Help them calculate remaining month predictions, daily budgets, saving goal progress, and debt clearances.
- Use their primary currency symbol (${context.profile.currency || '₹'}) for all monetary outputs.
- Be encouraging and supportive, never robotic or overly critical.
- Keep your tone direct, clear, and action-oriented. Suggest category limits and actionable tips.
- You can format your output using markdown (bold, lists, code blocks, tables).`;

  // 2. Format chat history for Gemini API.
  // Gemini contents structure expects roles: 'user' or 'model' with parts.
  const formattedContents = [];

  // Add historical context
  if (chatHistory && chatHistory.length > 0) {
    chatHistory.forEach(msg => {
      formattedContents.push({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
      });
    });
  }

  // Add current user message
  formattedContents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  try {
    const response = await axios.post(endpoint, {
      contents: formattedContents,
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000
      }
    });

    // Extract text from Gemini output structure
    const candidate = response.data?.candidates?.[0];
    const textResponse = candidate?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error('Received empty response from Gemini API.');
    }

    return textResponse;
  } catch (error) {
    console.error('Gemini API call failed:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Error communicating with Gemini API.');
  }
};
