import express from 'express';
import { chatWithAI, getAIInsights } from '../controllers/aiController.js';

const router = express.Router();

router.post('/chat', chatWithAI);
router.get('/insights', getAIInsights);

export default router;
