const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Keyboard markup for requesting phone number
const phoneKeyboard = {
    reply_markup: {
        keyboard: [[{
            text: '📱 Share Phone Number',
            request_contact: true
        }]],
        resize_keyboard: true,
        one_time_keyboard: true
    }
};

// Keyboard markup for feedback
const feedbackKeyboard = {
    reply_markup: {
        keyboard: [[{
            text: '✍️ Send Feedback'
        }]],
        resize_keyboard: true
    }
};

// Store users who are in the process of sending feedback
const userStates = new Map();

// Start command handler
bot.onText(/\/start/, async (msg) => {
    const userId = msg.from.id.toString();
    try {
        // Check if user exists
        const userResult = await pool.query(
            'SELECT * FROM users WHERE telegram_user_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            // New user - ask for phone number
            await bot.sendMessage(
                msg.chat.id,
                'Welcome! To use this feedback bot, please share your phone number.',
                phoneKeyboard
            );
        } else {
            // Existing user - show feedback button
            await bot.sendMessage(
                msg.chat.id,
                'Welcome back! You can send your feedback using the button below.',
                feedbackKeyboard
            );
        }
    } catch (error) {
        console.error('Database error:', error);
        await bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
    }
});

// Handle phone number sharing
bot.on('contact', async (msg) => {
    if (!msg.contact) return;

    const userId = msg.from.id.toString();
    const phoneNumber = msg.contact.phone_number;
    
    try {
        // Save user information
        await pool.query(
            `INSERT INTO users (telegram_user_id, username, phone_number, first_name, last_name)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (telegram_user_id) 
             DO UPDATE SET phone_number = $3, username = $2, first_name = $4, last_name = $5`,
            [
                userId,
                msg.from.username || null,
                phoneNumber,
                msg.from.first_name || null,
                msg.from.last_name || null
            ]
        );

        // Show feedback button
        await bot.sendMessage(
            msg.chat.id,
            'Thank you! You can now send your feedback using the button below.',
            feedbackKeyboard
        );
    } catch (error) {
        console.error('Database error:', error);
        await bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
    }
});

// Handle feedback button
bot.onText(/✍️ Send Feedback/, async (msg) => {
    const userId = msg.from.id.toString();
    userStates.set(userId, { awaitingFeedback: true });
    
    await bot.sendMessage(
        msg.chat.id,
        'Please write your feedback message:',
        { reply_markup: { remove_keyboard: true } }
    );
});

// Handle feedback messages
bot.on('message', async (msg) => {
    const userId = msg.from.id.toString();
    const userState = userStates.get(userId);

    if (!userState?.awaitingFeedback || msg.text === '✍️ Send Feedback') return;

    try {
        // Save feedback
        await pool.query(
            `INSERT INTO feedback (telegram_user_id, username, phone_number, content)
             SELECT u.telegram_user_id, u.username, u.phone_number, $2
             FROM users u WHERE u.telegram_user_id = $1`,
            [userId, msg.text]
        );

        // Clear user state
        userStates.delete(userId);

        // Send confirmation
        await bot.sendMessage(
            msg.chat.id,
            'Thank you for your feedback! We will review it soon.',
            feedbackKeyboard
        );
    } catch (error) {
        console.error('Database error:', error);
        await bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

module.exports = bot;
