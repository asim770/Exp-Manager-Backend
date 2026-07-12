import express from 'express';
import {
  getSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  addContribution,
  deleteSavingsGoal,
} from '../controllers/savingsController.js';

const router = express.Router();

router.get('/', getSavingsGoals);
router.post('/', createSavingsGoal);
router.put('/:id', updateSavingsGoal);
router.post('/:id/contribution', addContribution);
router.delete('/:id', deleteSavingsGoal);

export default router;
