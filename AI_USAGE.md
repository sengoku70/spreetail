# AI Usage Log

This document logs how AI tools were utilized during the development of SplitSmart, including concrete cases of correction.

---

## 1. Development Collaboration

*   **Scaffolding**: The AI was used to generate package templates and routing structures for both the Express backend and React frontend.
*   **Database Design**: Relational Prisma schema design was generated to enforce membership timeline logic (join/leave date boundaries).
*   **CSV Pipeline Validation**: Co-designed the 18 anomaly checks, validating parser states line-by-line using Node unit tests.

---

## 2. Concrete Cases of AI Mistakes & Corrections

### Case 1: Missing `.js` File Extensions in Node ES Modules
*   **What the AI generated**: The AI generated local import statements on the backend using standard bundler-style imports without extensions, e.g.:
    ```javascript
    import { getExchangeRate } from './currencyService';
    import authRouter from './routes/auth';
    ```
*   **How it was caught**: Running `node src/testServices.js` or starting the server threw a runtime exception:
    `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../src/services/currencyService' imported from ...`
*   **What was changed**: Because the backend is configured as a native ES Module (`"type": "module"` in `package.json`), Node.js strictly requires explicit file extensions. The code was corrected by appending `.js` to all relative module paths, e.g.:
    ```javascript
    import { getExchangeRate } from './currencyService.js';
    import authRouter from './routes/auth.js';
    ```

---

### Case 2: React 19 Peer Dependency Conflicts
*   **What the AI generated**: The AI added standard library dependencies to `frontend/package.json` assuming standard `npm install` execution would resolve them.
*   **How it was caught**: Vite scaffolded React v19, but `lucide-react@0.363.0` had strict peer dependencies restricting React usage to `^16.5.1 || ^17.0.0 || ^18.0.0`. The terminal threw an `ERESOLVE` unable to resolve dependency tree error.
*   **What was changed**: Instructed the installer to bypass metadata checks using:
    ```bash
    npm install --legacy-peer-deps
    ```
    This successfully built the React 19 modules.

---

### Case 3: Windows query-engine DLL Lock during Prisma Migrations
*   **What the AI generated**: Proposed database schema migrations while the Express development server was running in the background.
*   **How it was caught**: Running `npx prisma migrate dev` failed during the client generation stage with the error:
    `EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp11392' -> '...query_engine-windows.dll.node'`
*   **What was changed**: Realized that the active `nodemon` server process was running and holding a file lock on the Windows Prisma binary engine. The server was terminated (`Ctrl + C`), the migration command ran successfully, and the backend server was restarted.
