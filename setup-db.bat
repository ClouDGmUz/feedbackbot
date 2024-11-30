@echo off
echo Creating database...
psql -U postgres -h localhost -c "CREATE DATABASE feedbackbot;"

echo Running schema...
psql -U postgres -h localhost -d feedbackbot -f db/schema.sql

echo Creating admin user...
node scripts/create-admin.js admin adminpassword

echo Setup complete!
