# Feedback Bot

A Telegram feedback bot with admin interface built with Node.js, Express, PostgreSQL, and Tailwind CSS.

## Features

- Telegram bot for receiving user feedback
- Admin dashboard for managing feedback
- Secure admin authentication
- Real-time responses to users via Telegram

## Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn
- Telegram Bot Token (get it from @BotFather)

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a PostgreSQL database:
```sql
CREATE DATABASE feedbackbot;
```

4. Run the schema file:
```bash
psql -d feedbackbot -f db/schema.sql
```

5. Create a .env file with the following variables:
```
DATABASE_URL=postgresql://postgres:user@localhost:5432/feedbackbot
SESSION_SECRET=your-secret-key-here
PORT=3000
BOT_TOKEN=your-telegram-bot-token
```

6. Create an admin user:
```bash
node scripts/create-admin.js <username> <password>
```

7. Build the CSS:
```bash
npm run build:css
```

8. Start the server:
```bash
npm run dev
```

## Usage

1. Start a chat with your Telegram bot
2. Send any message to submit feedback
3. Access the admin dashboard at: http://localhost:3000/login
4. Login with your admin credentials
5. View and respond to feedback through the dashboard

## Security Features

- Secure password hashing with bcrypt
- Session management with PostgreSQL store
- Protected admin routes
- Environment-based configuration

## License

MIT
