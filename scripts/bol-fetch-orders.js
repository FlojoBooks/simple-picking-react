// scripts/bol-fetch-orders.js - Simplified BOL.com order fetching
require('dotenv').config();
const axios = require('axios');

// Access environment variables directly
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Debug logging
console.log(`🔍 BOL Fetch Orders - CLIENT_ID: ${CLIENT_ID ? 'loaded' : 'missing'}`);
console.log(`🔍 BOL Fetch Orders - CLIENT_SECRET: ${CLIENT_SECRET ? 'loaded' : 'missing'}`);

let token = null;
let tokenTimestamp = 0;

// Get BOL.com access token
async function getAccessToken() {
  const maxAge = 4 * 60 * 1000; // 4 minutes
  if (!token || Date.now() - tokenTimestamp > maxAge) {
    try {
      if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('BOL.com API credentials not configured');
      }

      const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      const response = await axios.post(
        'https://login.bol.com/token?grant_type=client_credentials',
        null,
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            Accept: 'application/json'
          },
          timeout: 10000
        }
      );

      if (!response.data.access_token) {
        throw new Error('No access token received from BOL.com');
      }

      token = response.data.access_token;
      tokenTimestamp = Date.now();
      console.log('🔑 BOL.com token obtained');
      return token;
    } catch (error) {
      throw new Error(`BOL.com authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }
  return token;
}

// Fetch all open FBR orders
async function fetchAllOrders() {
  try {
    const accessToken = await getAccessToken();
    let allOrders = [];
    let page = 1;
    const maxPages = 10; // Safety limit
    
    console.log('📦 Fetching BOL.com orders...');
    
    while (page <= maxPages) {
      try {
        console.log(`📄 Fetching page ${page}...`);
        
        const response = await axios.get(
          'https://api.bol.com/retailer/orders',
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.retailer.v10+json'
            },
            params: {
              status: 'OPEN',
              'fulfilment-method': 'FBR', // Only FBR orders
              page: page
            },
            timeout: 15000
          }
        );
        
        const orders = response.data.orders || [];
        
        if (orders.length === 0) {
          console.log(`📄 No more orders on page ${page}`);
          break;
        }
        
        allOrders = allOrders.concat(orders);
        console.log(`📄 Page ${page}: ${orders.length} orders (total: ${allOrders.length})`);
        page++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (pageError) {
        console.error(`❌ Error fetching page ${page}:`, pageError.message);
        
        if (pageError.response?.status === 401) {
          // Token expired, refresh and retry
          token = null;
          const newToken = await getAccessToken();
          continue;
        } else if (pageError.response?.status === 429) {
          // Rate limited
          console.log('⏳ Rate limited, waiting 30 seconds...');
          await new Promise(resolve => setTimeout(resolve, 30000));
          continue;
        } else {
          // Other error, skip this page
          page++;
          continue;
        }
      }
    }
    
    console.log(`✅ Total orders fetched: ${allOrders.length}`);
    return allOrders;
    
  } catch (error) {
    console.error('❌ Error fetching orders:', error);
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
}

// Main export function
async function fetchOrders() {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting BOL.com order fetch...');
    
    // Validate credentials
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('BOL.com API credentials not configured. Please set CLIENT_ID and CLIENT_SECRET environment variables.');
    }

    // Fetch orders
    const orders = await fetchAllOrders();
    
    if (orders.length === 0) {
      return {
        success: true,
        message: 'No open FBR orders found',
        ordersData: [],
        ordersCount: 0,
        duration: `${Math.round((Date.now() - startTime) / 1000)}s`
      };
    }

    // Process orders for easier frontend consumption
    const processedOrders = orders.map(order => ({
      orderId: order.orderId,
      orderPlacedDateTime: order.orderPlacedDateTime,
      latestShipDate: order.latestShipDate,
      orderItems: order.orderItems || [],
      shipmentDetails: order.shipmentDetails || {},
      billingDetails: order.billingDetails || {},
      status: 'OPEN'
    }));

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Order fetch completed in ${duration}s`);

    return {
      success: true,
      message: `Successfully fetched ${orders.length} orders from BOL.com`,
      ordersData: processedOrders,
      ordersCount: orders.length,
      duration: `${duration}s`,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`❌ Order fetch failed after ${duration}s:`, error.message);
    
    return {
      success: false,
      message: error.message,
      ordersData: [],
      ordersCount: 0,
      duration: `${duration}s`,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { fetchOrders };
