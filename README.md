# Traffic Violation Management System — Starter (Auth + Dashboard)

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create the database:
   - Open MySQL and run the contents of `sql/schema.sql`
     (or: `mysql -u root -p < sql/schema.sql`)

3. Create your `.env` file from the example:
   ```
   cp .env.example .env
   ```
   Then edit `.env` with your actual MySQL password and a random session secret.

4. Run the app:
   ```
   npm run dev
   ```
   (uses nodemon — auto-restarts on file changes)

5. Visit `http://localhost:3000` — you'll be redirected to `/login`.

## What's included
- `/register` — create a user (choose role: admin, officer, violator)
- `/login` — authenticate, starts a session
- `/dashboard` — protected route, only accessible when logged in
- `/logout` — destroys the session

## Next steps
- Add vehicle & violator CRUD routes
- Add violation recording form
- Add challan generation logic
- Add role-based dashboard views (Admin sees different panel than Officer)
