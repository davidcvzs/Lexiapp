import { Router } from 'express';
import multer from 'multer';

const router = Router();
const upload = multer({ dest: 'uploads/' });

router.post('/jobs', upload.single('media'), async (req, res) => {
  try {
    return res.status(501).json({ 
      error: 'Integracion Pendiente', 
      message: 'El Cloudflare Worker requiere modificaciones para aceptar carga directa sin openaiFileIdRefs.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar el archivo multimedia.' });
  }
});

router.get('/jobs/:job_id', async (req, res) => {
  return res.status(501).json({ error: 'Not Implemented' });
});

router.get('/jobs/:job_id/transcript', async (req, res) => {
  return res.status(501).json({ error: 'Not Implemented' });
});

router.delete('/jobs/:job_id', async (req, res) => {
  return res.status(501).json({ error: 'Not Implemented' });
});

export default router;
