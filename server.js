require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const initializeDatabase = require('./db/init');
const axios = require('axios');

const app = express();

// Initialize database before starting server
initializeDatabase().then(() => {
    // PostgreSQL connection pool
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    // Initialize Telegram bot
    const bot = require('./bot');

    // Store user states
    const userStates = new Map();

    // Check if user exists in database
    async function checkExistingUser(telegramUserId) {
        try {
            const query = 'SELECT * FROM users WHERE telegram_user_id = $1';
            const result = await pool.query(query, [telegramUserId]);
            return result.rows.length > 0 ? result.rows[0] : null;
        } catch (error) {
            console.error('Error checking existing user:', error);
            return null;
        }
    }

    // Create or update user
    async function upsertUser(userData) {
        try {
            const query = `
                INSERT INTO users (
                    telegram_user_id, username, first_name, last_name, last_interaction
                ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
                ON CONFLICT (telegram_user_id) 
                DO UPDATE SET 
                    username = EXCLUDED.username,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    last_interaction = CURRENT_TIMESTAMP
                RETURNING *
            `;
            const values = [
                userData.id.toString(),
                userData.username || null,
                userData.first_name || null,
                userData.last_name || null
            ];
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Error upserting user:', error);
            throw error;
        }
    }

    // Update user phone number
    async function updateUserPhone(telegramUserId, phoneNumber) {
        try {
            const query = `
                UPDATE users 
                SET phone_number = $1, last_interaction = CURRENT_TIMESTAMP
                WHERE telegram_user_id = $2
                RETURNING *
            `;
            const result = await pool.query(query, [phoneNumber, telegramUserId]);
            return result.rows[0];
        } catch (error) {
            console.error('Error updating user phone:', error);
            throw error;
        }
    }

    // Make bot available in routes
    app.set('bot', bot);

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static('public'));
    app.set('view engine', 'ejs');

    // Session middleware with PostgreSQL store
    app.use(session({
        store: new pgSession({
            pool,
            tableName: 'session'
        }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
    }));

    // Authentication middleware
    const requireAuth = (req, res, next) => {
        if (req.session.userId) {
            next();
        } else {
            res.redirect('/login');
        }
    };

    // Make db pool available in routes
    app.use((req, res, next) => {
        req.db = pool;
        next();
    });

    // Routes
    app.get('/login', (req, res) => {
        res.render('login');
    });

    app.post('/login', async (req, res) => {
        const { username, password, 'g-recaptcha-response': recaptchaResponse } = req.body;

        // Verify reCAPTCHA
        try {
            const recaptchaVerification = await axios.post(
                'https://www.google.com/recaptcha/api/siteverify',
                null,
                {
                    params: {
                        secret: process.env.RECAPTCHA_SECRET_KEY,
                        response: recaptchaResponse
                    }
                }
            );

            if (!recaptchaVerification.data.success) {
                return res.render('login', { error: 'Please complete the reCAPTCHA verification' });
            }

            // Proceed with login
            const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
            const user = result.rows[0];
            
            if (user && await bcrypt.compare(password, user.password_hash)) {
                req.session.userId = user.id;
                res.redirect('/admin');
            } else {
                res.render('login', { error: 'Invalid credentials' });
            }
        } catch (error) {
            console.error('Login error:', error);
            res.render('login', { error: 'An error occurred during login' });
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/login');
    });

    // Protected admin routes
    app.use('/admin', requireAuth, require('./routes/admin'));

    app.use('/feedback', require('./routes/feedback'));

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
