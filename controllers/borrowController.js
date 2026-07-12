import Borrow from '../models/Borrow.js';
import Notification from '../models/Notification.js';

// Get borrow records
export const getBorrows = async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (search) {
      query.personName = { $regex: search, $options: 'i' };
    }
    
    const records = await Borrow.find(query).sort({ dueDate: 1 });
    res.json(records);
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving borrow records', error: error.message });
  }
};

// Create a borrow record
export const createBorrow = async (req, res) => {
  try {
    const { personName, contactNumber, amount, borrowDate, dueDate, interest, notes } = req.body;
    
    if (!personName || !amount || !dueDate) {
      return res.status(400).json({ message: 'Person name, amount, and due date are required' });
    }
    
    const record = await Borrow.create({
      personName,
      contactNumber,
      amount: Number(amount),
      remainingAmount: Number(amount),
      borrowDate: borrowDate ? new Date(borrowDate) : new Date(),
      dueDate: new Date(dueDate),
      interest: interest ? Number(interest) : 0,
      notes,
      status: 'pending',
    });
    
    // Auto-create notification for upcoming due date if it is within 3 days
    const diffDays = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 3 && diffDays >= 0) {
      await Notification.create({
        title: 'Borrow Payment Due Soon',
        message: `You owe $${Number(amount).toFixed(2)} to ${personName} due on ${new Date(dueDate).toLocaleDateString()}.`,
        type: 'payment',
      });
    }
    
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ message: 'Error creating borrow record', error: error.message });
  }
};

// Update a borrow record
export const updateBorrow = async (req, res) => {
  try {
    const { id } = req.params;
    const { personName, contactNumber, amount, remainingAmount, borrowDate, dueDate, interest, notes, status } = req.body;
    
    const record = await Borrow.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    
    if (personName !== undefined) record.personName = personName;
    if (contactNumber !== undefined) record.contactNumber = contactNumber;
    if (amount !== undefined) record.amount = Number(amount);
    if (remainingAmount !== undefined) record.remainingAmount = Number(remainingAmount);
    if (borrowDate !== undefined) record.borrowDate = new Date(borrowDate);
    if (dueDate !== undefined) record.dueDate = new Date(dueDate);
    if (interest !== undefined) record.interest = Number(interest);
    if (notes !== undefined) record.notes = notes;
    if (status !== undefined) record.status = status;
    
    await record.save();
    res.json(record);
  } catch (error) {
    res.status(500).json({ message: 'Error updating borrow record', error: error.message });
  }
};

// Record a payment towards borrow record
export const recordBorrowPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, notes, date } = req.body;
    
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Valid payment amount is required' });
    }
    
    const record = await Borrow.findById(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    
    if (record.status === 'paid') {
      return res.status(400).json({ message: 'This record is already fully paid' });
    }
    
    const payAmt = Number(amount);
    record.remainingAmount = Math.max(0, record.remainingAmount - payAmt);
    
    record.paymentHistory.push({
      date: date ? new Date(date) : new Date(),
      amount: payAmt,
      notes: notes || 'Partial payment',
    });
    
    if (record.remainingAmount <= 0) {
      record.status = 'paid';
    }
    
    await record.save();
    res.json(record);
  } catch (error) {
    res.status(500).json({ message: 'Error recording borrow payment', error: error.message });
  }
};

// Delete a borrow record
export const deleteBorrow = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await Borrow.findByIdAndDelete(id);
    if (!record) {
      return res.status(404).json({ message: 'Record not found' });
    }
    res.json({ message: 'Record deleted successfully', record });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting borrow record', error: error.message });
  }
};
