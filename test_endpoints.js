import axios from 'axios';

const API_URL = 'http://127.0.0.1:5001/api';

async function runTests() {
  console.log('Starting end-to-end API verification tests...');
  let success = true;

  // 1. Test GET Profile
  try {
    const res = await axios.get(`${API_URL}/profile`);
    console.log('✅ GET /api/profile works. Current name:', res.data.name);
  } catch (err) {
    console.error('❌ GET /api/profile failed:', err.message);
    success = false;
  }

  // 2. Test PUT Profile
  try {
    const res = await axios.put(`${API_URL}/profile`, {
      name: 'Asim Maji Testing',
      currency: '₹',
      monthlyBudget: 2500,
      budgetAlertPercentage: 75
    });
    console.log('✅ PUT /api/profile works. Updated budget:', res.data.monthlyBudget);
  } catch (err) {
    console.error('❌ PUT /api/profile failed:', err.message);
    success = false;
  }

  // 3. Test POST Transaction
  let txId = null;
  try {
    const res = await axios.post(`${API_URL}/transactions`, {
      type: 'expense',
      category: 'Food',
      amount: 150,
      notes: 'Test expense transaction',
      date: new Date().toISOString()
    });
    txId = res.data._id;
    console.log('✅ POST /api/transactions works. Created Tx ID:', txId);
  } catch (err) {
    console.error('❌ POST /api/transactions failed:', err.message);
    success = false;
  }

  // 4. Test GET Dashboard stats
  try {
    const res = await axios.get(`${API_URL}/dashboard`);
    console.log('✅ GET /api/dashboard works. Current Balance:', res.data.currentBalance);
  } catch (err) {
    console.error('❌ GET /api/dashboard failed:', err.message);
    success = false;
  }

  // 5. Test DELETE Transaction
  if (txId) {
    try {
      await axios.delete(`${API_URL}/transactions/${txId}`);
      console.log('✅ DELETE /api/transactions/:id works.');
    } catch (err) {
      console.error('❌ DELETE /api/transactions/:id failed:', err.message);
      success = false;
    }
  }

  if (success) {
    console.log('🎉 All backend API verification tests PASSED successfully!');
    process.exit(0);
  } else {
    console.log('⚠️ Some API tests failed.');
    process.exit(1);
  }
}

runTests();
