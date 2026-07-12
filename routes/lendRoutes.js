import express from 'express';
import {
  getLends,
  createLend,
  updateLend,
  recordLendPayment,
  deleteLend,
} from '../controllers/lendController.js';

const router = express.Router();

router.get('/', getLends);
router.post('/', createLend);
router.put('/:id', updateLend);
router.post('/:id/payment', recordLendPayment);
router.delete('/:id', deleteLend);

export default router;
