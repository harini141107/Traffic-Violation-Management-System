# Traffic Violation Management System (TVMS)

## Stack
- Node.js + Express
- EJS
- MySQL
- bcrypt + express-session

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file using `.env.example` and set your MySQL credentials.

3. For a **new database**, run `sql/schema.sql`. It creates all TVMS tables in the correct dependency order.

4. If you already have an older version of the TVMS database, run `sql/migration.sql` once to add the newer columns safely.

5. Start the application:
   ```
   npm run dev
   ```

6. Open `http://localhost:3000`.

## Main modules
- Authentication and role-based access
- Admin/officer vehicle and violator management
- Traffic violation recording
- Automatic demerit-point tracking and licence flagging
- Challan generation and payment
- Payment receipts
- Violator disputes and officer/admin resolution
- Search and reports
- Dashboard statistics

## Important database change
The `users` table now contains `violator_id`, so a violator login can be linked to exactly one violator record. The complete schema already includes this relationship.
