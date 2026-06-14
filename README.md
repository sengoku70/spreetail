# SplitSmart - Shared Expenses Web App (Spreetail Assignment)

SplitSmart is a production-quality shared expenses web application built to replace messy spreadsheets for flatmates. The app addresses specific requirements for each user: Aisha's net settlement summaries, Rohan's balance audits, Priya's exchange rate conversions, Sam's join date timeline filters, and Meera's duplicate review workflow.

---

## Tech Stack

*   **Backend**: Node.js + Express (TypeScript)
*   **Database**: PostgreSQL
*   **ORM**: Prisma
*   **Frontend**: React + Vite (TypeScript) + Tailwind CSS v3
*   **Authentication**: JWT-based session management stored in httpOnly cookies (bcrypt password hashing)
*   **Deployment**: Railway/Render (Backend + DB), Vercel (Frontend)

---

## Getting Started

### Prerequisites

*   Node.js (v18 or higher)
*   PostgreSQL database running locally or in the cloud

### Installation & Local Setup

1.  **Clone or Open the Repository**

2.  **Setup Backend**
    ```bash
    cd backend
    npm install
    ```
    *   Create a `.env` file in the `backend/` directory:
        ```env
        PORT=5000
        DATABASE_URL="postgresql://username:password@localhost:5432/splitsmart?schema=public"
        JWT_SECRET="your-super-secret-jwt-signing-key"
        EXCHANGE_RATE_API_KEY="your-exchangerate-api-key"
        NODE_ENV=development
        ```
    *   Generate Prisma Client & Run DB Migrations:
        ```bash
        npx prisma generate --schema=src/prisma/schema.prisma
        npx prisma migrate dev --schema=src/prisma/schema.prisma --name=init
        ```
    *   Start Backend Dev Server:
        ```bash
        npm run dev
        ```

3.  **Setup Frontend**
    ```bash
    cd ../frontend
    npm install --legacy-peer-deps
    ```
    *   Start Frontend Dev Server:
        ```bash
        npm run dev
        ```
    *   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## CSV Import Format

The importer parses spreadsheets containing the following headers:
`Date,Description,Paid By,Amount,Currency,Split Type,Split Details,Remarks`

---

## Deployment Instructions

### Database & Backend (Railway / Render)
1.  Provision a PostgreSQL database on Railway or Render.
2.  Deploy the `backend` folder as a Node.js web service.
3.  Set the environment variables on the hosting platform (specifically `DATABASE_URL` and `JWT_SECRET`).
4.  Run Prisma migrations in the deployment command or during build time: `npx prisma migrate deploy --schema=src/prisma/schema.prisma`.

### Frontend (Vercel)
1.  Connect your repository to Vercel.
2.  Set the root directory to `frontend`.
3.  Add environment variable `VITE_API_URL` pointing to your deployed backend URL.
4.  Deploy.
