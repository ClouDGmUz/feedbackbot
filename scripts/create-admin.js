require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function createAdminUser(username, password) {
    try {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        const query = 'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2) RETURNING id';
        const result = await pool.query(query, [username, passwordHash]);
        
        console.log(`Admin user created successfully with ID: ${result.rows[0].id}`);
    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        await pool.end();
    }
}

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
    console.error('Please provide username and password as arguments');
    console.log('Usage: node create-admin.js <username> <password>');
    process.exit(1);
}

createAdminUser(username, password);
