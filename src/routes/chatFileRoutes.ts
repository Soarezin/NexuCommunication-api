import express from 'express';
import multer from 'multer';
import { uploadChatFile } from '../controllers/chat/chatFileController';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload-chat-file', upload.single('file'), uploadChatFile);

export default router;
