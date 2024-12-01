const express = require('express');
const router = express.Router();

// Admin dashboard
router.get('/', async (req, res) => {
    try {
        const { startDate, endDate, responseStatus, search } = req.query;
        
        let query = `
            SELECT f.*, 
                   CASE 
                       WHEN f.username IS NOT NULL THEN f.username 
                       ELSE f.telegram_user_id 
                   END as display_name
            FROM feedback f 
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;
        
        // Date range filter
        if (startDate && endDate) {
            query += ` AND created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
            params.push(startDate, endDate);
            paramIndex += 2;
        }
        
        // Response status filter
        if (responseStatus) {
            if (responseStatus === 'responded') {
                query += ` AND admin_responded = true`;
            } else if (responseStatus === 'not_responded') {
                query += ` AND admin_responded = false`;
            }
        }
        
        // Search filter
        if (search) {
            query += ` AND (
                content ILIKE $${paramIndex}
                OR username ILIKE $${paramIndex}
                OR telegram_user_id::text ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        query += ` ORDER BY created_at DESC`;
        
        const result = await req.db.query(query, params);
        res.render('admin/dashboard', { feedback: result.rows });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).render('error', { message: 'Error fetching feedback' });
    }
});

// Respond to feedback
router.post('/respond/:feedbackId', async (req, res) => {
    try {
        const { response } = req.body;
        const feedbackId = req.params.feedbackId;
        
        // Update feedback in database
        const query = 'UPDATE feedback SET admin_responded = true, admin_response = $1 WHERE id = $2 RETURNING *';
        const result = await req.db.query(query, [response, feedbackId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Feedback not found' });
        }

        const feedback = result.rows[0];
        
        // Send response via Telegram bot in Uzbek
        const bot = req.app.get('bot');
        await bot.sendMessage(feedback.telegram_user_id, 
            `Admindan javob:\n\nSizning fikr-mulohazangiz: ${feedback.content}\n\nJavob: ${response}`
        );

        res.json({ success: true, message: 'Response sent successfully' });
    } catch (error) {
        console.error('Error responding to feedback:', error);
        res.status(500).json({ success: false, message: 'Error sending response' });
    }
});

// Delete feedback
router.delete('/feedback/:feedbackId', async (req, res) => {
    try {
        const query = 'DELETE FROM feedback WHERE id = $1 RETURNING *';
        const result = await req.db.query(query, [req.params.feedbackId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Feedback not found' });
        }
        res.json({ success: true, message: 'Feedback deleted successfully' });
    } catch (error) {
        console.error('Error deleting feedback:', error);
        res.status(500).json({ success: false, message: 'Error deleting feedback' });
    }
});

module.exports = router;
