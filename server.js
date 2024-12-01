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

    // Root route and 404 handler
    app.use((req, res) => {
        res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>404 - Page Not Found</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    body {
                        font-family: 'Inter', sans-serif;
                        background: #1a1a1a;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0;
                        color: #fff;
                    }
                    .glitch {
                        position: relative;
                        font-size: 150px;
                        font-weight: bold;
                        text-shadow: 0.05em 0 0 #00fffc, -0.03em -0.04em 0 #fc00ff,
                                   0.025em 0.04em 0 #fffc00;
                        animation: glitch 725ms infinite;
                    }
                    .glitch span {
                        position: absolute;
                        top: 0;
                        left: 0;
                    }
                    .glitch span:first-child {
                        animation: glitch 500ms infinite;
                        clip-path: polygon(0 0, 100% 0, 100% 35%, 0 35%);
                        transform: translate(-0.04em, -0.03em);
                        opacity: 0.75;
                    }
                    .glitch span:last-child {
                        animation: glitch 375ms infinite;
                        clip-path: polygon(0 65%, 100% 65%, 100% 100%, 0 100%);
                        transform: translate(0.04em, 0.03em);
                        opacity: 0.75;
                    }
                    @keyframes glitch {
                        0% {
                            text-shadow: 0.05em 0 0 #00fffc, -0.03em -0.04em 0 #fc00ff,
                                       0.025em 0.04em 0 #fffc00;
                        }
                        15% {
                            text-shadow: 0.05em 0 0 #00fffc, -0.03em -0.04em 0 #fc00ff,
                                       0.025em 0.04em 0 #fffc00;
                        }
                        16% {
                            text-shadow: -0.05em -0.025em 0 #00fffc, 0.025em 0.035em 0 #fc00ff,
                                       -0.05em -0.05em 0 #fffc00;
                        }
                        49% {
                            text-shadow: -0.05em -0.025em 0 #00fffc, 0.025em 0.035em 0 #fc00ff,
                                       -0.05em -0.05em 0 #fffc00;
                        }
                        50% {
                            text-shadow: 0.05em 0.035em 0 #00fffc, 0.03em 0 0 #fc00ff,
                                       0 -0.04em 0 #fffc00;
                        }
                        99% {
                            text-shadow: 0.05em 0.035em 0 #00fffc, 0.03em 0 0 #fc00ff,
                                       0 -0.04em 0 #fffc00;
                        }
                        100% {
                            text-shadow: -0.05em 0 0 #00fffc, -0.025em -0.04em 0 #fc00ff,
                                       -0.04em -0.025em 0 #fffc00;
                        }
                    }
                </style>
            </head>
            <body class="bg-[#1a1a1a]">
                <div class="text-center">
                    <h1 class="glitch mb-8">
                        404
                        <span aria-hidden="true">404</span>
                        <span aria-hidden="true">404</span>
                    </h1>
                    <p class="text-2xl mb-4 text-gray-400">Page not found</p>
                    <p class="text-gray-500 mb-8">The page you're looking for doesn't exist or has been moved.</p>
                    <a href="https://condoroil.uz" 
                       class="inline-flex items-center px-6 py-3 text-lg font-medium text-white bg-gradient-to-r from-purple-500 to-indigo-600 rounded-lg hover:from-purple-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-200 shadow-lg hover:shadow-xl">
                        ← Back to Homepage
                    </a>
                </div>
                <script>
                    // Add some random glitch effects
                    setInterval(() => {
                        const glitch = document.querySelector('.glitch');
                        glitch.style.transform = \`translate(\${Math.random() * 2 - 1}px, \${Math.random() * 2 - 1}px)\`;
                        setTimeout(() => {
                            glitch.style.transform = 'translate(0, 0)';
                        }, 50);
                    }, 2500);
                </script>
            </body>
            </html>
        `);
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});
