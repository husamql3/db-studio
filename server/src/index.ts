import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getTablesList } from './utils.js'

const app = new Hono()

// Add CORS middleware
app.use('/*', cors())

app.get('/tables', async (c) => {
  try {
    console.log('Fetching tables list...')
    const tablesList = await getTablesList()
    console.log('Tables fetched successfully:', tablesList.length, 'tables')
    return c.json(tablesList)
  } catch (error) {
    console.error('Error fetching tables list:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return c.json({ error: 'Failed to fetch tables list', message: errorMessage }, 500)
  }
});

app.get('/', (c) => {
  return c.json({ message: 'Hello World' })
})

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set!');
  console.error('Please create a .env file with DATABASE_URL=your_connection_string');
  process.exit(1);
}

serve({
  fetch: app.fetch,
  port: 3000,
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`);
  console.log(`Database URL: ${process.env.DATABASE_URL?.split('@')[1] || 'Not configured'}`);
});
