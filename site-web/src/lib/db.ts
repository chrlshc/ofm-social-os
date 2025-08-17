import { neon } from '@neondatabase/serverless';

/**
 * Initialize a Neon serverless database client.
 *
 * The `DATABASE_URL` environment variable must be set in your `.env` file at
 * runtime.  The value should be a valid PostgreSQL connection string
 * provided by Neon.  When deploying to a serverless environment such as
 * Vercel, Neon will automatically handle connection pooling.  When running
 * locally, the `neon` client will establish a secure connection over
 * WebSocket.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not defined');
}

/**
 * The `sql` tagged template function can be used to run parameterized SQL
 * queries.  All parameters passed to the template will be automatically
 * escaped by the Neon client, protecting against SQL injection attacks.
 */
export const sql = neon(connectionString);