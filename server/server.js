/**
 * Express.js Server for NSE API Proxy
 * Alternative to Netlify Functions - provides better cookie handling
 * 
 * Run: node server/server.js
 * Deploy to: Railway, Render, or Heroku
 */

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Create cookie jar for maintaining session
const cookieJar = new CookieJar();
const client = wrapper(axios.create({ jar: cookieJar }));

// Cache for NSE session (reuse cookies for 5 minutes)
let sessionCookie = null;
let sessionTimestamp = null;
const SESSION_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Establish NSE session and get cookies
 */
async function getNSESession() {
  const now = Date.now();
  
  // Use cached session if still valid
  if (sessionCookie && sessionTimestamp && (now - sessionTimestamp) < SESSION_TTL) {
    return sessionCookie;
  }

  try {
    console.log('Establishing new NSE session...');
    
    const response = await client.get('https://www.nseindia.com', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
      },
    });

    // Extract cookies from jar
    const cookies = cookieJar.getCookiesSync('https://www.nseindia.com');
    sessionCookie = cookies.map(cookie => cookie.toString()).join('; ');
    sessionTimestamp = now;
    
    console.log('NSE session established successfully');
    return sessionCookie;
  } catch (error) {
    console.error('Error establishing NSE session:', error.message);
    throw new Error('Failed to establish NSE session');
  }
}

/**
 * Fetch option chain data from NSE
 */
app.get('/api/option-chain', async (req, res) => {
  try {
    const symbol = (req.query.symbol || 'NIFTY').toUpperCase();
    
    // Validate symbol
    const validSymbols = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'];
    if (!validSymbols.includes(symbol)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid symbol. Use NIFTY, BANKNIFTY, or FINNIFTY',
      });
    }

    // Get NSE session cookies
    const cookies = await getNSESession();

    // Fetch option chain data
    const url = `https://www.nseindia.com/api/option-chain-indices?symbol=${symbol}`;
    
    const response = await client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nseindia.com/',
        'Origin': 'https://www.nseindia.com',
        'Cookie': cookies,
      },
    });

    res.json({
      success: true,
      symbol,
      timestamp: new Date().toISOString(),
      data: response.data,
    });

  } catch (error) {
    console.error('Error fetching option chain:', error.message);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch data from NSE API',
      symbol: req.query.symbol || 'NIFTY',
      timestamp: new Date().toISOString(),
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NSE API Proxy Server running on port ${PORT}`);
  console.log(`📡 Option Chain API: http://localhost:${PORT}/api/option-chain?symbol=NIFTY`);
});

