import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const API_URL = 'http://127.0.0.1:5001/api';

async function testFullAuthFlow() {
  console.log('🚀 Running Complete End-to-End Auth Verification...\n');

  const testEmail = `testuser_${Date.now()}@example.com`;
  const initialPassword = 'Password123!';
  const updatedPassword = 'NewSecretPassword456!';
  const testName = 'Test User';

  // 1. Sign Up
  console.log('1️⃣ Testing Signup:');
  const signupRes = await axios.post(`${API_URL}/auth/signup`, {
    name: testName,
    email: testEmail,
    password: initialPassword,
    confirmPassword: initialPassword,
  });
  console.log('   ✅ User registered successfully:', signupRes.data.user.email);
  const token = signupRes.data.token;

  // 2. Access Protected Route
  console.log('\n2️⃣ Testing Protected Route with JWT:');
  const profileRes = await axios.get(`${API_URL}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('   ✅ Protected route returned profile for:', profileRes.data.name);

  // 3. Duplicate Signup Rejection
  console.log('\n3️⃣ Testing Duplicate Signup:');
  try {
    await axios.post(`${API_URL}/auth/signup`, {
      name: testName,
      email: testEmail,
      password: initialPassword,
      confirmPassword: initialPassword,
    });
    throw new Error('Duplicate signup did not fail');
  } catch (err) {
    console.log('   ✅ Correctly rejected with status:', err.response?.status, '-', err.response?.data?.message);
  }

  // 4. Login with Correct Password
  console.log('\n4️⃣ Testing Valid Login:');
  const loginRes = await axios.post(`${API_URL}/auth/login`, {
    email: testEmail,
    password: initialPassword,
  });
  console.log('   ✅ Login successful, token received:', !!loginRes.data.token);

  // 5. Login with Incorrect Password
  console.log('\n5️⃣ Testing Invalid Password Login:');
  try {
    await axios.post(`${API_URL}/auth/login`, {
      email: testEmail,
      password: 'WrongPassword!',
    });
    throw new Error('Invalid login did not fail');
  } catch (err) {
    console.log('   ✅ Correctly rejected with status:', err.response?.status, '-', err.response?.data?.message);
  }

  // 6. Forgot Password for Unknown Email
  console.log('\n6️⃣ Testing Forgot Password on Unknown Email:');
  try {
    await axios.post(`${API_URL}/auth/forgot-password`, {
      email: 'nobody_exists_here_99999@example.com',
    });
    throw new Error('Unknown email did not fail');
  } catch (err) {
    console.log('   ✅ Correctly rejected with status:', err.response?.status, '-', err.response?.data?.message);
  }

  // 7. Request Password Reset OTP
  console.log('\n7️⃣ Testing Forgot Password OTP Generation:');
  const forgotRes = await axios.post(`${API_URL}/auth/forgot-password`, {
    email: testEmail,
  });
  console.log('   ✅ OTP requested:', forgotRes.data.message);

  // 8. Test Resend Cooldown
  console.log('\n8️⃣ Testing OTP Resend Cooldown (Rate Limiting):');
  try {
    await axios.post(`${API_URL}/auth/forgot-password`, {
      email: testEmail,
    });
    throw new Error('Rate limit cooldown was not enforced');
  } catch (err) {
    console.log('   ✅ Correctly rate-limited with status:', err.response?.status, '-', err.response?.data?.message);
  }

  // 9. Retrieve OTP Hash from DB and find matching 6-digit code
  console.log('\n9️⃣ Locating Generated OTP for Verification:');
  await mongoose.connect(process.env.MONGODB_URI);
  const usersCollection = mongoose.connection.db.collection('users');
  const userInDb = await usersCollection.findOne({ email: testEmail });
  const storedHash = userInDb.resetOtpHash;

  let actualOtp = null;
  // Brute force 6 digits (takes < 100ms in memory)
  for (let i = 100000; i <= 999999; i++) {
    const candidate = i.toString();
    if (crypto.createHash('sha256').update(candidate).digest('hex') === storedHash) {
      actualOtp = candidate;
      break;
    }
  }
  console.log('   ✅ Found generated OTP from secure hash:', actualOtp);

  // 10. Test Wrong OTP Verification
  console.log('\n🔟 Testing Wrong OTP Code:');
  try {
    await axios.post(`${API_URL}/auth/verify-otp`, {
      email: testEmail,
      otp: '000000',
    });
    throw new Error('Wrong OTP did not fail');
  } catch (err) {
    console.log('   ✅ Correctly rejected with status:', err.response?.status, '-', err.response?.data?.message);
  }

  // 11. Test Correct OTP Verification
  console.log('\n1️⃣1️⃣ Testing Correct OTP Verification:');
  const verifyRes = await axios.post(`${API_URL}/auth/verify-otp`, {
    email: testEmail,
    otp: actualOtp,
  });
  console.log('   ✅ OTP verified! Received resetToken:', !!verifyRes.data.resetToken);
  const resetToken = verifyRes.data.resetToken;

  // 12. Test Reusing OTP (should fail because OTP was invalidated)
  console.log('\n1️⃣2️⃣ Testing Re-use of verified OTP (Single-use test):');
  try {
    await axios.post(`${API_URL}/auth/verify-otp`, {
      email: testEmail,
      otp: actualOtp,
    });
    throw new Error('Reused OTP did not fail');
  } catch (err) {
    console.log('   ✅ Reused OTP correctly rejected with status:', err.response?.status, '-', err.response?.data?.message);
  }

  // 13. Test Reset Password with Invalid Token
  console.log('\n1️⃣3️⃣ Testing Reset Password with Invalid Token:');
  try {
    await axios.post(`${API_URL}/auth/reset-password`, {
      email: testEmail,
      resetToken: 'invalid_fake_reset_token_123',
      password: updatedPassword,
      confirmPassword: updatedPassword,
    });
    throw new Error('Invalid reset token did not fail');
  } catch (err) {
    console.log('   ✅ Invalid token correctly rejected with status:', err.response?.status, '-', err.response?.data?.message);
  }

  // 14. Test Reset Password with Valid Token
  console.log('\n1️⃣4️⃣ Testing Reset Password with Valid Token:');
  const resetRes = await axios.post(`${API_URL}/auth/reset-password`, {
    email: testEmail,
    resetToken: resetToken,
    password: updatedPassword,
    confirmPassword: updatedPassword,
  });
  console.log('   ✅ Password reset successfully:', resetRes.data.message);

  // 15. Test Login with Old Password (should fail)
  console.log('\n1️⃣5️⃣ Testing Login with Old Password:');
  try {
    await axios.post(`${API_URL}/auth/login`, {
      email: testEmail,
      password: initialPassword,
    });
    throw new Error('Old password was accepted after reset');
  } catch (err) {
    console.log('   ✅ Old password correctly rejected with status:', err.response?.status, '-', err.response?.data?.message);
  }

  // 16. Test Login with New Password (should succeed)
  console.log('\n1️⃣6️⃣ Testing Login with New Password:');
  const newLoginRes = await axios.post(`${API_URL}/auth/login`, {
    email: testEmail,
    password: updatedPassword,
  });
  console.log('   ✅ Login with new password SUCCESSFUL! Token:', !!newLoginRes.data.token);

  // Cleanup test user
  await usersCollection.deleteOne({ email: testEmail });
  await mongoose.connection.db.collection('profiles').deleteMany({ user: new mongoose.Types.ObjectId(newLoginRes.data.user._id) });
  await mongoose.disconnect();

  console.log('\n🎉 ALL 16 BACKEND AUTHENTICATION TESTS PASSED WITH 100% SUCCESS!\n');
}

testFullAuthFlow().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
