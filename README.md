# NSE Options Chain Dashboard

A modern, production-ready web dashboard for viewing NSE Options Chain data (NIFTY / BANKNIFTY) with real-time updates.

## Tech Stack

- **Frontend**: React + Vite
- **Styling**: Tailwind CSS
- **Charts**: Chart.js + react-chartjs-2
- **Backend**: Netlify Functions (Node.js)
- **Hosting**: Netlify

## Project Structure

```
Option_Trading/
├── src/                    # Frontend React application
│   ├── components/         # React components
│   ├── utils/              # Helper functions
│   ├── App.jsx             # Main App component
│   └── main.jsx            # Entry point
├── netlify/
│   └── functions/          # Serverless functions (NSE API proxy)
├── dist/                   # Build output (generated)
├── package.json
├── vite.config.js
├── tailwind.config.js
└── netlify.toml            # Netlify configuration
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Development Workflow

This project is being built incrementally, step by step.

## Testing Netlify Functions Locally

To test the serverless function locally, you'll need Netlify CLI:

1. Install Netlify CLI globally:
   ```bash
   npm install -g netlify-cli
   ```

2. Run the local development server:
   ```bash
   netlify dev
   ```

3. Test the function:
   ```
   http://localhost:8888/.netlify/functions/fetchNSEData?symbol=NIFTY
   ```

   Or for BANKNIFTY:
   ```
   http://localhost:8888/.netlify/functions/fetchNSEData?symbol=BANKNIFTY
   ```

## API Endpoint

- **Function**: `fetchNSEData`
- **Query Parameter**: `symbol` (NIFTY, BANKNIFTY, or FINNIFTY)
- **Response**: JSON with option chain data from NSE

Example:
```
/.netlify/functions/fetchNSEData?symbol=NIFTY
```

