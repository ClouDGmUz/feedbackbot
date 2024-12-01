const TelegramBot = require('node-telegram-bot-api');
const { Pool } = require('pg');
require('dotenv').config();
const messages = require('./locales/uz');

// Create a bot instance
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// PostgreSQL connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Keyboard markup for requesting phone number
const phoneKeyboard = {
    reply_markup: {
        keyboard: [[{
            text: messages.buttons.share_phone,
            request_contact: true
        }]],
        resize_keyboard: true,
        one_time_keyboard: true
    }
};

// Keyboard markup for feedback button
const feedbackKeyboard = {
    reply_markup: {
        keyboard: [[{
            text: messages.buttons.send_feedback
        }]],
        resize_keyboard: true
    }
};

// Start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const username = msg.from.username || '';
    const firstName = msg.from.first_name || '';
    const lastName = msg.from.last_name || '';

    try {
        // Check if user exists
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE telegram_user_id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            // Create new user
            await pool.query(
                'INSERT INTO users (telegram_user_id, username, first_name, last_name) VALUES ($1, $2, $3, $4)',
                [userId, username, firstName, lastName]
            );
            // Ask for phone number if new user
            bot.sendMessage(chatId, messages.welcome.new_user, phoneKeyboard);
        } else {
            // Existing user
            if (!userCheck.rows[0].phone_number) {
                // If user exists but no phone number
                bot.sendMessage(chatId, messages.welcome.new_user, phoneKeyboard);
            } else {
                // User exists and has phone number
                bot.sendMessage(chatId, messages.welcome.returning_user, feedbackKeyboard);
            }
        }
    } catch (error) {
        console.error('Error in /start command:', error);
        bot.sendMessage(chatId, messages.feedback.error);
    }
});

// Handle contact sharing (phone number)
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const phoneNumber = msg.contact.phone_number;

    try {
        // Update user's phone number
        await pool.query(
            'UPDATE users SET phone_number = $1 WHERE telegram_user_id = $2',
            [phoneNumber, userId]
        );

        // Show feedback button
        bot.sendMessage(chatId, messages.welcome.returning_user, feedbackKeyboard);
    } catch (error) {
        console.error('Error saving phone number:', error);
        bot.sendMessage(chatId, messages.feedback.error);
    }
});

// Handle "Send Feedback" button
bot.onText(new RegExp(messages.buttons.send_feedback), (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, messages.feedback.prompt);
});

// Handle feedback messages
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/') && msg.text !== messages.buttons.send_feedback) {
        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        const feedbackContent = msg.text;

        try {
            // Get user information
            const userResult = await pool.query(
                'SELECT username, phone_number FROM users WHERE telegram_user_id = $1',
                [userId]
            );

            if (userResult.rows.length > 0) {
                const user = userResult.rows[0];
                // Save feedback
                await pool.query(
                    'INSERT INTO feedback (telegram_user_id, username, phone_number, content) VALUES ($1, $2, $3, $4)',
                    [userId, user.username, user.phone_number, feedbackContent]
                );
                
                bot.sendMessage(chatId, messages.feedback.thank_you, feedbackKeyboard);
            }
        } catch (error) {
            console.error('Error saving feedback:', error);
            bot.sendMessage(chatId, messages.feedback.error);
        }
    }
});

// Error handling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

module.exports = bot;