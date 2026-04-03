# Boardroom OS

A full-stack node application designed to instantiate AI board member sessions using the Anthropic API and Supabase state management.

## Deployment on Railway

This repository is pre-configured with `NIXPACKS` settings and `Procfile` structures designed directly for a one-click deployment on Railway.

### Deployment Steps:
1. Go to [Railway](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select this repository.
4. You must add these environment variables before the build fully spins up:
   - `ANTHROPIC_API_KEY`: Your Anthropic API Key
   - `SUPABASE_URL`: Your Supabase API URL
   - `SUPABASE_ANON_KEY`: Your Supabase Anon Key
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key
   - `SESSION_SECRET`: A secure randomly generated hash
   - `NODE_ENV`: `production`
5. Start the deployment. Railway assigns `process.env.PORT` automatically which the application natively binds to.

### Connecting Supabase
The required `.env` variables allow the server to bypass Postgres RLS seamlessly via service integrations while protecting frontend flows securely inside Express middleware. You must have already executed the required SQL schemas in your Supabase SQL UI before booting.
