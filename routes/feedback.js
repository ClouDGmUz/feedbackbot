const express = require('express');
const router = express.Router();

// Submit feedback
router.post('/submit', async (req, res) => {
    try {
        const { userId, content } = req.body;
        const query = 'INSERT INTO feedback (user_id, content) VALUES ($1, $2) RETURNING *';
        const values = [userId, content];
        
        const result = await req.db.query(query, values);
        res.json({ success: true, message: 'Feedback submitted successfully', feedback: result.rows[0] });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get user's feedback
router.get('/user/:userId', async (req, res) => {
    try {
        const query = 'SELECT * FROM feedback WHERE user_id = $1 ORDER BY created_at DESC';
        const values = [req.params.userId];
        
        const result = await req.db.query(query, values);
        res.json({ success: true, feedback: result.rows });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
