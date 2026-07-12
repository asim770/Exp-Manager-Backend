import Lend from '../models/Lend.js';
import Notification from '../models/Notification.js';

// Get lending records
export const getLends = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.personName = { $regex: search, $options: 'i' };
    }
    
    const records = await Lend.find(query).sort({ dueDate: 1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving lending records', error: error.message });
  }
};

// Create a lending record
export const createLend = async (req, res) => {
  try {
    const { personName, contactNumber, amount, lendingDate, dueDate, interest, notes } = req.body;
    
    if (!personName || !amount || !dueDate) {
      return res.status(400).json({ message: 'Person name, amount, and due date are required' });
    }
    
    const record = await Lend.create({
      personName,
      contactNumber,
      amount: Number(amount),
      remainingAmount: Number(amount),
      lendingDate: lendingDate ? new Date(lendingDate) : new Date(),
      dueDate: new Date(dueDate),
      interest: interest ? Number(interest) : 0,
      notes,
      status: 'pending',
    });
    
    // Auto-create notification for upcoming collection date if it is within 3 days
    const diffDays = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 3 && diffDays >= 0) {
      await Notification.create({
        title: 'Lent Collection Due Soon',
        message: `You are scheduled to collect $${Number(amount).toFixed(2)} from ${personName} on ${new Date(dueDate).toLocaleDateString()}.`,
        type: 'payment',
      });
    }
    
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ message: 'Error creating lending record', error: error.message });
  }
};

// Update a lending record
export const updateLend = async (req, res) => {
  try {
    const { id } = req.params;
    const { personName, contactNumber, amount, remainingAmount, lendingDate, dueDate, interest, notes, status } = req.body;
    
    const record = await Lend.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    
    if (personName !== undefined) record.personName = personName;
    if (contactNumber !== undefined) record.contactNumber = contactNumber;
    if (amount !== undefined) record.amount = Number(amount);
    if (remainingAmount !== undefined) record.remainingAmount = Number(remainingAmount);
    if (lendingDate !== undefined) record.lendingDate = new Date(lendingDate);
    if (dueDate !== undefined) record.dueDate = new Date(dueDate);
    if (interest !== undefined) record.interest = Number(interest);
    if (notes !== undefined) record.notes = notes;
    if (status !== undefined) record.status = status;
    
    await record.save();
    res.json(record);
  } catch (error) {
    res.status(500).json({ message: 'Error updating lending record', error: error.message });
  }
};

// Record a repayment towards lending record
export const recordLendPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes, date } = req.body;
    
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required' });
    }
    
    const record = await Lend.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    
    if (record.status === 'repaid') {
      return res.status(400).json({ message: 'This record is already fully repaid' });
    }
    
    const payAmt = Number(amount);
    record.remainingAmount = Math.max(0, record.remainingAmount - payAmt);
    
    record.paymentHistory.push({
      date: date ? new Date(date) : new Date(),
      amount: payAmt,
      notes: notes || 'Received partial payment',
    });
    
    if (record.remainingAmount <= 0) {
      record.status = 'repaid';
    }
    
    await record.save();
    res.json(record);
  } catch (error) {
    res.status(500).json({ message: 'Error recording repayment', error: error.message });
  }
};

// Delete a lending record
export const deleteLend = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Lend.findByIdAndDelete(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    res.json({ message: 'Record deleted successfully', record });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting lending record', error: error.message });
  }
};
