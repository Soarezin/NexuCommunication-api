import { Request, Response } from 'express';
import { supabase } from '../../lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

export const uploadChatFile = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { caseId } = req.body;

    if (!file) return res.status(400).json({ error: 'Arquivo ausente' });
    if (!caseId) return res.status(400).json({ error: 'caseId ausente' });

    const fileName = `${caseId}/${uuidv4()}-${file.originalname}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-files')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('chat-files').getPublicUrl(fileName);

    return res.status(200).json({
      url: data.publicUrl,
      name: file.originalname,
      type: file.mimetype,
    });
  } catch (err) {
    console.error('[UploadChatFile] Erro ao fazer upload:', err);
    return res.status(500).json({ error: 'Erro ao fazer upload de arquivo.' });
  }
};
