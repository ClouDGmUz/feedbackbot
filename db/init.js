const { Pool } = require('pg');
require('dotenv').config();

async function initializeDatabase() {
    // Connect to postgres database to create new database if needed
    const pgPool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        // Check if database exists
        const dbCheckResult = await pgPool.query(
            "SELECT 1 FROM pg_database WHERE datname = 'feedbackbot'"
        );

        // Create database if it doesn't exist
        if (dbCheckResult.rows.length === 0) {
            console.log('Creating database...');
            await pgPool.query('CREATE DATABASE feedbackbot');
        }
    } catch (error) {
        console.error('Error checking/creating database:', error);
        throw error;
    } finally {
        await pgPool.end();
    }

    // Connect to the feedbackbot database
    const appPool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        // Create session table
        await appPool.query(`
            CREATE TABLE IF NOT EXISTS "session" (
                "sid" varchar NOT NULL COLLATE "default",
                "sess" json NOT NULL,
                "expire" timestamp(6) NOT NULL,
                CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
            )
        `);

        // Create admin users table
        await appPool.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create users table
        await appPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                telegram_user_id VARCHAR(255) NOT NULL UNIQUE,
                username VARCHAR(255),
                phone_number VARCHAR(20),
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create feedback table
        await appPool.query(`
            CREATE TABLE IF NOT EXISTS feedback (
                id SERIAL PRIMARY KEY,
                telegram_user_id VARCHAR(255) NOT NULL,
                username VARCHAR(255),
                phone_number VARCHAR(20),
                content TEXT NOT NULL,
                admin_responded BOOLEAN DEFAULT FALSE,
                admin_response TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (telegram_user_id) REFERENCES users(telegram_user_id)
            )
        `);

        // Check if admin user exists, create default if not
        const adminResult = await appPool.query('SELECT 1 FROM admin_users LIMIT 1');
        if (adminResult.rows.length === 0) {
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash('admin', salt);
            
            await appPool.query(
                'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
                ['admin', hash]
            );
            console.log('Created default admin user (username: admin, password: admin)');
        }

        console.log('Database initialization complete!');
    } catch (error) {
        console.error('Error initializing database schema:', error);
        throw error;
    } finally {
        await appPool.end();
    }
}

module.exports = initializeDatabase;
