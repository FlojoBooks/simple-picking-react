// scripts/bol-picking-list.js - Simplified picking list generation
import axios from 'axios';

const { CLIENT_ID, CLIENT_SECRET } = process.env;

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

      token = response.data.access_token;
      tokenTimestamp = Date.now();
      console.log('🔑 BOL.com token obtained for picking list');
      return token;
    } catch (error) {
      throw new Error(`BOL.com authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }
  return token;
}

// Fetch order details
async function fetchOrderDetails(orderId) {
  try {
    const accessToken = await getAccessToken();
    
    const response = await axios.get(
      `https://api.bol.com/retailer/orders/${orderId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.retailer.v10+json'
        },
        timeout: 10000
      }
    );
    
    return response.data;
  } catch (error) {
    console.warn(`⚠️ Failed to fetch details for order ${orderId}:`, error.message);
    return null;
  }
}

// Fetch all open orders for picking list
async function fetchOrdersForPicking() {
  try {
    const accessToken = await getAccessToken();
    let allOrders = [];
    let page = 1;
    
    console.log('📋 Fetching orders for picking list...');
    
    while (page <= 5) { // Limit to 5 pages for simplicity
      const response = await axios.get(
        'https://api.bol.com/retailer/orders',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.retailer.v10+json'
          },
          params: {
            status: 'OPEN',
            'fulfilment-method': 'FBR',
            page: page
          },
          timeout: 15000
        }
      );
      
      const orders = response.data.orders || [];
      
      if (orders.length === 0) {
        break;
      }
      
      allOrders = allOrders.concat(orders);
      console.log(`📄 Page ${page}: ${orders.length} orders`);
      page++;
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return allOrders;
  } catch (error) {
    throw new Error(`Failed to fetch orders: ${error.message}`);
  }
}

// Generate warehouse location based on product info
function generateLocation(product) {
  if (!product) return 'UNKNOWN';
  
  // Simple location generation based on EAN or product type
  const ean = product.ean || '';
  if (ean.length >= 4) {
    const section = ean.substring(0, 1);
    const aisle = ean.substring(1, 3);
    const shelf = ean.substring(3, 4);
    return `${String.fromCharCode(65 + parseInt(section) % 26)}-${aisle}-${shelf}`;
  }
  
  // Fallback location
  return `A-${Math.floor(Math.random() * 99) + 1}-${Math.floor(Math.random() * 9) + 1}`;
}

// Main picking list generation function
export async function generatePickingList() {
  const startTime = Date.now();
  
  try {
    console.log('🚀 Generating picking list...');
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('BOL.com API credentials not configured');
    }

    // Fetch all open orders
    const orders = await fetchOrdersForPicking();
    
    if (orders.length === 0) {
      return {
        success: true,
        message: 'No open orders found for picking',
        pickingList: [],
        totalOrders: 0,
        totalItems: 0
      };
    }
    
    console.log(`📦 Processing ${orders.length} orders for picking list...`);
    
    const pickingList = [];
    let processedCount = 0;
    let errorCount = 0;
    
    for (const order of orders) {
      try {
        // Get detailed order information
        const orderDetails = await fetchOrderDetails(order.orderId);
        
        if (!orderDetails || !orderDetails.orderItems) {
          console.warn(`⚠️ No order items found for ${order.orderId}`);
          errorCount++;
          continue;
        }
        
        // Process each order item
        for (const item of orderDetails.orderItems) {
          const shipment = orderDetails.shipmentDetails || {};
          
          const pickingEntry = {
            // Order identification
            MessageID: order.orderId,
            OrderItemID: item.orderItemId || `item_${Date.now()}`,
            
            // Customer information
            FirstName: shipment.firstName || '',
            LastName: shipment.surname || shipment.lastName || '',
            
            // Shipping address
            ShipStreet: shipment.streetName || '',
            ShipHouseNr: shipment.houseNumber || '',
            ShipHouseNrExt: shipment.houseNumberExtension || '',
            ShipZipcode: shipment.zipCode || '',
            ShipCity: shipment.city || '',
            ShipCountrycode: shipment.countryCode || 'NL',
            
            // Contact information
            ReceiverEmail: shipment.email || '',
            ReceiverSMS: shipment.phoneNumber || '',
            
            // Product information
            ProductTitle: item.product?.title || 'Unknown Product',
            EAN: item.product?.ean || '',
            
            // Warehouse location (generated)
            location: item.offer?.reference || generateLocation(item.product),
            originalReference: item.offer?.reference || '',
            
            // Picking status
            picked: false,
            pickTimestamp: null,
            locationConfirmed: false,
            
            // Additional data
            quantity: item.quantity || 1,
            price: item.unitPrice || 0,
            
            // Order metadata
            orderDate: order.orderDate || order.orderPlacedDateTime || '',
            latestShipDate: order.latestShipDate || '',
            
            // Processing metadata
            processedAt: new Date().toISOString()
          };
          
          pickingList.push(pickingEntry);
        }
        
        processedCount++;
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ Error processing order ${order.orderId}:`, error.message);
        errorCount++;
        
        // Add error entry to maintain order tracking
        pickingList.push({
          MessageID: order.orderId,
          OrderItemID: '',
          FirstName: '',
          LastName: '',
          ProductTitle: 'ERROR: Failed to fetch details',
          EAN: '',
          location: '',
          picked: false,
          error: error.message,
          processedAt: new Date().toISOString()
        });
      }
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log(`✅ Picking list generated in ${duration}s`);
    console.log(`📊 Results: ${pickingList.length} items from ${processedCount} orders (${errorCount} errors)`);

    return {
      success: true,
      message: `Generated picking list with ${pickingList.length} items from ${processedCount} orders${errorCount > 0 ? ` (${errorCount} errors)` : ''}`,
      pickingList: pickingList,
      totalOrders: processedCount,
      totalItems: pickingList.length,
      errorCount: errorCount,
      duration: `${duration}s`,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.error(`❌ Picking list generation failed after ${duration}s:`, error.message);
    
    return {
      success: false,
      message: `Picking list generation failed: ${error.message}`,
      pickingList: [],
      totalOrders: 0,
      totalItems: 0,
      errorCount: 1,
      duration: `${duration}s`,
      timestamp: new Date().toISOString()
    };
  }
}

// Update picking status
export function updatePickingStatus(pickingList, orderId, itemId, picked = true, location = '') {
  const item = pickingList.find(item => 
    item.MessageID === orderId && 
    (item.OrderItemID === itemId || item.EAN === itemId)
  );
  
  if (item) {
    item.picked = picked;
    if (location) item.location = location;
    item.pickTimestamp = picked ? new Date().toISOString() : null;
    item.locationConfirmed = !!location;
    
    console.log(`📦 Updated picking status for ${orderId}: ${picked ? 'PICKED' : 'PENDING'}`);
    return true;
  }
  
  console.warn(`⚠️ Could not find item to update: ${orderId}/${itemId}`);
  return false;
}

// Get picking statistics
export function getPickingStats(pickingList) {
  if (!pickingList || pickingList.length === 0) {
    return {
      total: 0,
      picked: 0,
      pending: 0,
      pickRate: 0
    };
  }
  
  const total = pickingList.length;
  const picked = pickingList.filter(item => item.picked).length;
  const pending = total - picked;
  const pickRate = total > 0 ? Math.round((picked / total) * 100) : 0;
  
  return {
    total,
    picked,
    pending,
    pickRate
  };
}