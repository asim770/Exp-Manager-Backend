import express from 'express';
import {
  getBorrows,
  createBorrow,
  updateBorrow,
  recordBorrowPayment,
  deleteBorrow,
} from '../controllers/borrowController.js';

const router = express.Router();

router.get('/', getBorrows);
router.post('/', createBorrow);
router.put('/:id', updateBorrow);
router.post('/:id/payment', recordBorrowPayment);
router.delete('/:id', deleteBorrow);

export default router;
