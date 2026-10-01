import express from 'express';
import {
  getDashboardSummary,
  getGroups,
  getGroupDetails,
  createGroup,
  addExpense,
  settlePayment,
  respondToInvitation,
  deleteGroup,
} from '../controllers/splitGroupController.js';

const router = express.Router();

// Summary route for lightweight dashboard widget
router.get('/summary', getDashboardSummary);

// Standard group management
router.get('/', getGroups);
router.post('/', createGroup);
router.get('/:id', getGroupDetails);
router.delete('/:id', deleteGroup);

// Expenses & settlements inside group
router.post('/:id/expenses', addExpense);
router.post('/:id/settle', settlePayment);

// Invitation response (accept/decline)
router.post('/:id/invitations/respond', respondToInvitation);

export default router;
