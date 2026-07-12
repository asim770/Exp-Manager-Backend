import Profile from '../models/Profile.js';

export const getProfile = async (req, res) => {
  try {
    let profile = await Profile.findOne();
    if (!profile) {
      profile = await Profile.create({
        name: 'Asim Maji',
        currency: 'USD',
        monthlyBudget: 2000,
        budgetAlertPercentage: 80,
        savingsGoal: 5000,
        theme: 'dark',
      });
    }
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving profile', error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    let profile = await Profile.findOne();
    if (!profile) {
      profile = new Profile();
    }
    
    const { name, currency, monthlyBudget, budgetAlertPercentage, savingsGoal, theme } = req.body;
    
    if (name !== undefined) profile.name = name;
    if (currency !== undefined) profile.currency = currency;
    if (monthlyBudget !== undefined) profile.monthlyBudget = Number(monthlyBudget);
    if (budgetAlertPercentage !== undefined) profile.budgetAlertPercentage = Number(budgetAlertPercentage);
    if (savingsGoal !== undefined) profile.savingsGoal = Number(savingsGoal);
    if (theme !== undefined) profile.theme = theme;
    
    await profile.save();
    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};
