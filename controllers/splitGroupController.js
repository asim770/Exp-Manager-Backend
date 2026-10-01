import mongoose from 'mongoose';
import SplitGroup from '../models/SplitGroup.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

// Helper to calculate user's balance in a group
const calculateUserBalance = (group, userId, userEmail = '') => {
  const userIdStr = userId ? userId.toString() : '';
  const cleanEmail = (userEmail || '').toLowerCase();
  let balance = 0;

  // Expenses calculation
  if (Array.isArray(group.expenses)) {
    group.expenses.forEach(exp => {
      const isPayer = exp.paidBy && exp.paidBy.toString() === userIdStr;
      const userSplit = exp.splits?.find(s => 
        (s.user && s.user.toString() === userIdStr) ||
        (cleanEmail && s.email && s.email.toLowerCase() === cleanEmail)
      );
      const userShare = userSplit ? Number(userSplit.amount) : 0;

      if (isPayer) {
        // User paid the full expense, so they are owed the remainder
        balance += (Number(exp.amount) - userShare);
      } else if (userShare > 0) {
        // User didn't pay, so they owe their share
        balance -= userShare;
      }
    });
  }

  // Settlements calculation
  if (Array.isArray(group.settlements)) {
    group.settlements.forEach(settlement => {
      if (settlement.status === 'completed') {
        const isSender = settlement.from && settlement.from.toString() === userIdStr;
        const isReceiver = settlement.to && settlement.to.toString() === userIdStr;
        if (isSender) {
          // User paid money back, reducing what they owe
          balance += Number(settlement.amount);
        } else if (isReceiver) {
          // User received money back, reducing what they are owed
          balance -= Number(settlement.amount);
        }
      }
    });
  }

  const rounded = Math.round(balance * 100) / 100;
  let status = 'settled';
  if (rounded > 0.01) status = 'owed';
  else if (rounded < -0.01) status = 'owe';

  return {
    balance: rounded,
    status,
    absAmount: Math.abs(rounded),
  };
};

// GET /api/split-groups/summary - Lightweight dashboard overview
export const getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email.toLowerCase();

    // Find all groups where user is a member or has email invite
    const groups = await SplitGroup.find({
      $or: [
        { 'members.user': userId },
        { 'members.email': userEmail },
      ]
    })
    .select('name emoji description members expenses.amount expenses.paidBy expenses.splits settlements.from settlements.to settlements.amount settlements.status createdAt')
    .lean();

    let pendingInvitationsCount = 0;
    const userAcceptedGroups = [];

    groups.forEach(g => {
      const memberEntry = g.members?.find(m => 
        (m.user && m.user.toString() === userId.toString()) || 
        (m.email && m.email.toLowerCase() === userEmail)
      );

      if (memberEntry?.status === 'pending') {
        pendingInvitationsCount++;
      } else if (memberEntry?.status === 'accepted') {
        const totalExpenses = (g.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const membersCount = (g.members || []).filter(m => m.status !== 'declined').length;
        const balanceData = calculateUserBalance(g, userId, userEmail);

        userAcceptedGroups.push({
          _id: g._id,
          name: g.name,
          emoji: g.emoji || '👥',
          description: g.description,
          memberCount: membersCount,
          totalExpenses,
          balance: balanceData.balance,
          balanceStatus: balanceData.status,
          absBalance: balanceData.absAmount,
          createdAt: g.createdAt,
        });
      }
    });

    // Sort most recent first
    userAcceptedGroups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      totalGroups: userAcceptedGroups.length,
      pendingInvitationsCount,
      groups: userAcceptedGroups.slice(0, 6),
    });
  } catch (error) {
    console.error('Error fetching split groups summary:', error);
    res.status(500).json({ message: 'Failed to fetch split groups summary', error: error.message });
  }
};

// GET /api/split-groups - Get all groups for user
export const getGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email.toLowerCase();

    const groups = await SplitGroup.find({
      $or: [
        { 'members.user': userId },
        { 'members.email': userEmail },
      ]
    })
    .select('name emoji description createdBy members expenses.amount expenses.paidBy expenses.splits settlements.from settlements.to settlements.amount settlements.status createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

    const enrichedGroups = groups.map(g => {
      const totalExpenses = (g.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const balanceData = calculateUserBalance(g, userId, userEmail);
      const userMember = g.members?.find(m => 
        (m.user && m.user.toString() === userId.toString()) || 
        (m.email && m.email.toLowerCase() === userEmail)
      );

      return {
        _id: g._id,
        name: g.name,
        emoji: g.emoji || '👥',
        description: g.description,
        createdBy: g.createdBy,
        isCreator: g.createdBy.toString() === userId.toString(),
        memberCount: (g.members || []).filter(m => m.status !== 'declined').length,
        pendingMembersCount: (g.members || []).filter(m => m.status === 'pending').length,
        totalExpenses,
        expenseCount: (g.expenses || []).length,
        balance: balanceData.balance,
        balanceStatus: balanceData.status,
        absBalance: balanceData.absAmount,
        userStatus: userMember?.status || 'pending',
        userRole: userMember?.role || 'member',
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      };
    });

    res.json(enrichedGroups);
  } catch (error) {
    console.error('Error fetching split groups:', error);
    res.status(500).json({ message: 'Failed to fetch split groups', error: error.message });
  }
};

// GET /api/split-groups/:id - Get full group details
export const getGroupDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userEmail = req.user.email.toLowerCase();

    const group = await SplitGroup.findById(id).lean();
    if (!group) {
      return res.status(404).json({ message: 'Split group not found' });
    }

    // Verify membership
    const isMember = group.members?.some(m => 
      (m.user && m.user.toString() === userId.toString()) || 
      (m.email && m.email.toLowerCase() === userEmail)
    );

    if (!isMember && group.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You are not a member of this split group' });
    }

    const totalExpenses = (group.expenses || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const balanceData = calculateUserBalance(group, userId);

    // Calculate individual balances for all accepted members
    const memberBalances = {};
    (group.members || []).forEach(m => {
      if (m.user) {
        memberBalances[m.user.toString()] = calculateUserBalance(group, m.user);
      }
    });

    res.json({
      ...group,
      totalExpenses,
      userBalance: balanceData.balance,
      userBalanceStatus: balanceData.status,
      userAbsBalance: balanceData.absAmount,
      memberBalances,
    });
  } catch (error) {
    console.error('Error fetching group details:', error);
    res.status(500).json({ message: 'Failed to fetch group details', error: error.message });
  }
};

// POST /api/split-groups - Create a new group
export const createGroup = async (req, res) => {
  try {
    const { name, description, emoji, members } = req.body;
    const userId = req.user._id;
    const userEmail = req.user.email.toLowerCase();
    const userName = req.user.name;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    // Prepare creator as first accepted admin member
    const initialMembers = [
      {
        user: userId,
        email: userEmail,
        name: userName,
        role: 'admin',
        status: 'accepted',
        joinedAt: new Date(),
      }
    ];

    // Process other invited members
    const invitedUserIds = [];
    if (Array.isArray(members)) {
      for (const m of members) {
        const cleanEmail = m.email?.trim().toLowerCase();
        if (!cleanEmail || cleanEmail === userEmail) continue;

        // Check if already in list
        if (initialMembers.some(im => im.email === cleanEmail)) continue;

        // Lookup registered user by email
        const registeredUser = await User.findOne({ email: cleanEmail }).lean();

        initialMembers.push({
          user: registeredUser ? registeredUser._id : null,
          email: cleanEmail,
          name: m.name?.trim() || registeredUser?.name || cleanEmail.split('@')[0],
          role: 'member',
          status: 'pending',
          joinedAt: new Date(),
        });

        if (registeredUser) {
          invitedUserIds.push(registeredUser._id);
        }
      }
    }

    const newGroup = new SplitGroup({
      name: name.trim(),
      description: description?.trim() || '',
      emoji: emoji || '👥',
      currency: 'INR',
      createdBy: userId,
      members: initialMembers,
      expenses: [],
      settlements: [],
    });

    await newGroup.save();

    // Create notifications for registered invited users
    for (const invId of invitedUserIds) {
      try {
        await Notification.create({
          user: invId,
          title: 'Split Group Invitation',
          message: `${userName} invited you to join the group "${newGroup.name}"`,
          type: 'group_invite',
          data: {
            groupId: newGroup._id,
            groupName: newGroup.name,
            inviterName: userName,
          },
        });
      } catch (notifErr) {
        console.error('Failed to send invite notification:', notifErr);
      }
    }

    res.status(201).json(newGroup);
  } catch (error) {
    console.error('Error creating split group:', error);
    res.status(500).json({ message: 'Failed to create split group', error: error.message });
  }
};

// POST /api/split-groups/:id/expenses - Add an expense
export const addExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, amount, category, paidBy, splitType, splits, date } = req.body;
    const userId = req.user._id;

    if (!title || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Title and a valid positive amount are required' });
    }

    const group = await SplitGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Split group not found' });
    }

    // Verify membership
    const userMember = group.members.find(m => m.user && m.user.toString() === userId.toString());
    if (!userMember && group.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You are not an authorized member of this group' });
    }

    const actualPayerId = paidBy || userId;
    const payerMember = group.members.find(m => m.user && m.user.toString() === actualPayerId.toString());
    const payerName = payerMember ? payerMember.name : req.user.name;

    const splitTargetMembers = group.members.filter(m => m.status !== 'declined');
    let finalSplits = [];

    if (splitType === 'equal' || !splits || splits.length === 0) {
      // Split equally among all active group members
      const memberCount = splitTargetMembers.length || 1;
      const splitAmount = Math.round((Number(amount) / memberCount) * 100) / 100;
      
      let runningSum = 0;
      finalSplits = splitTargetMembers.map((m, index) => {
        // Handle rounding difference on the last member
        let share = splitAmount;
        if (index === splitTargetMembers.length - 1) {
          share = Math.round((Number(amount) - runningSum) * 100) / 100;
        } else {
          runningSum += share;
        }

        return {
          user: m.user || null,
          email: m.email || '',
          userName: m.name,
          amount: share,
        };
      });
    } else {
      finalSplits = splits.map(s => ({
        user: s.user || null,
        email: s.email || '',
        userName: s.userName || 'Member',
        amount: Number(s.amount),
      }));
    }

    const newExpense = {
      _id: new mongoose.Types.ObjectId(),
      title: title.trim(),
      amount: Number(amount),
      category: category || 'General',
      paidBy: actualPayerId,
      paidByName: payerName,
      splitType: splitType || 'equal',
      splits: finalSplits,
      date: date ? new Date(date) : new Date(),
      createdAt: new Date(),
    };

    group.expenses.push(newExpense);
    group.updatedAt = new Date();
    await group.save();

    res.status(201).json({ message: 'Expense added successfully', expense: newExpense, group });
  } catch (error) {
    console.error('Error adding expense:', error);
    res.status(500).json({ message: 'Failed to add expense', error: error.message });
  }
};

// POST /api/split-groups/:id/settle - Record a settlement
export const settlePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { to, toName, amount, notes, date } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;

    if (!to || !amount || Number(amount) <= 0) {
      return res.status(400).json({ message: 'Recipient and a valid positive amount are required' });
    }

    const group = await SplitGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Split group not found' });
    }

    const newSettlement = {
      _id: new mongoose.Types.ObjectId(),
      from: userId,
      fromName: userName,
      to,
      toName: toName || 'Member',
      amount: Number(amount),
      date: date ? new Date(date) : new Date(),
      status: 'completed',
      notes: notes?.trim() || '',
      createdAt: new Date(),
    };

    group.settlements.push(newSettlement);
    group.updatedAt = new Date();
    await group.save();

    // Notify recipient
    try {
      await Notification.create({
        user: to,
        title: 'Settlement Payment Recorded',
        message: `${userName} recorded a settlement of ₹${Number(amount).toLocaleString()} to you in "${group.name}".`,
        type: 'payment',
        data: { groupId: group._id },
      });
    } catch (notifErr) {
      console.error('Failed to send settlement notification:', notifErr);
    }

    res.status(201).json({ message: 'Settlement recorded successfully', settlement: newSettlement, group });
  } catch (error) {
    console.error('Error settling payment:', error);
    res.status(500).json({ message: 'Failed to record settlement', error: error.message });
  }
};

// POST /api/split-groups/:id/invitations/respond - Accept or decline invitation
export const respondToInvitation = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body; // 'accept' or 'decline'
    const userId = req.user._id;
    const userEmail = req.user.email.toLowerCase();

    const group = await SplitGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Split group not found' });
    }

    const memberIndex = group.members.findIndex(m => 
      (m.user && m.user.toString() === userId.toString()) || 
      (m.email && m.email.toLowerCase() === userEmail)
    );

    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Invitation not found for this user' });
    }

    if (action === 'accept') {
      group.members[memberIndex].status = 'accepted';
      group.members[memberIndex].user = userId;
      group.members[memberIndex].name = req.user.name;
    } else {
      group.members[memberIndex].status = 'declined';
    }

    group.updatedAt = new Date();
    await group.save();

    // Mark corresponding notification as read if any
    await Notification.updateMany(
      { user: userId, type: 'group_invite', 'data.groupId': group._id },
      { read: true }
    );

    res.json({ message: `Invitation ${action}ed successfully`, group });
  } catch (error) {
    console.error('Error responding to invitation:', error);
    res.status(500).json({ message: 'Failed to respond to invitation', error: error.message });
  }
};

// DELETE /api/split-groups/:id - Delete group or leave
export const deleteGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const group = await SplitGroup.findById(id);
    if (!group) {
      return res.status(404).json({ message: 'Split group not found' });
    }

    // If creator, delete group
    if (group.createdBy.toString() === userId.toString()) {
      await SplitGroup.findByIdAndDelete(id);
      return res.json({ message: 'Split group deleted successfully' });
    }

    // Otherwise, remove user from members (leave group)
    group.members = group.members.filter(m => !m.user || m.user.toString() !== userId.toString());
    await group.save();

    res.json({ message: 'Left the split group successfully' });
  } catch (error) {
    console.error('Error deleting/leaving split group:', error);
    res.status(500).json({ message: 'Failed to delete or leave group', error: error.message });
  }
};
