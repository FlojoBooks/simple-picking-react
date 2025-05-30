// scripts/bol-create-shipments.js - Simplified BOL.com shipment creation
const axios = require('axios');

const { CLIENT_ID, CLIENT_SECRET } = process.env;

// PostNL configuration for BOL.com API (PostNL uses TNT transporter code in BOL)
const POSTNL_CONFIG = {
  bolTransporterCode: 'TNT', // BOL.com requires "TNT" code for PostNL shipments
  actualCarrier: 'PostNL',
  trackingUrlPattern: 'https://postnl.nl/tracktrace/?B=',
  trackingCodeFormat: /^3S[0-9A-Z]{13}NL$/
};

// Get BOL.com access token
async function getAccessToken() {
  try {
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
    return response.data.access_token;
  } catch (error) {
    throw new Error(`Authentication failed: ${error.response?.data?.error_description || error.message}`);
  }
}

// Generate PostNL tracking code if not provided
function generatePostNLTrackingCode() {
  const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let trackingCode = '3S';
  
  for (let i = 0; i < 13; i++) {
    trackingCode += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return trackingCode + 'NL';
}

// Create shipment in BOL.com
async function createShipment(token, orderItemId, shipmentData) {
  try {
    // Always use TNT as transporter code for BOL.com, even though we're using PostNL
    const trackAndTrace = shipmentData.trackAndTrace || generatePostNLTrackingCode();
    
    // Validate tracking code format
    if (!POSTNL_CONFIG.trackingCodeFormat.test(trackAndTrace)) {
      console.warn(`Invalid PostNL tracking code format: ${trackAndTrace}. Expected format: 3S[13chars]NL`);
    }
    
    const shipmentPayload = {
      orderItems: [{
        orderItemId: orderItemId,
        quantity: shipmentData.quantity || 1
      }],
      shipmentReference: shipmentData.reference || `POSTNL_${Date.now()}`,
      shippingLabelId: shipmentData.shippingLabelId || `PNL_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      transport: {
        transporterCode: POSTNL_CONFIG.bolTransporterCode, // "TNT" for BOL.com API
        trackAndTrace: trackAndTrace
      }
    };

    console.log(`📮 Creating PostNL shipment (BOL transporter code: ${POSTNL_CONFIG.bolTransporterCode}) for order item ${orderItemId}`);
    console.log(`📦 Tracking code: ${trackAndTrace}`);
    console.log(`🔗 Track at: ${POSTNL_CONFIG.trackingUrlPattern}${trackAndTrace}`);

    const response = await axios.post(
      'https://api.bol.com/retailer/shipments',
      shipmentPayload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.retailer.v10+json',
          'Content-Type': 'application/vnd.retailer.v10+json'
        },
        timeout: 15000
      }
    );
    
    return {
      ...response.data,
      trackAndTrace: trackAndTrace,
      transporterCode: POSTNL_CONFIG.bolTransporterCode,
      actualCarrier: POSTNL_CONFIG.actualCarrier,
      trackingUrl: `${POSTNL_CONFIG.trackingUrlPattern}${trackAndTrace}`
    };
  } catch (error) {
    throw new Error(`Failed to create PostNL shipment: ${error.response?.data?.title || error.message}`);
  }
}

// Main export function
async function createShipments(orderItems = null) {
  try {
    console.log('🚀 Starting PostNL shipment creation process...');
    console.log(`📮 Using ${POSTNL_CONFIG.actualCarrier} with BOL.com transporter code: ${POSTNL_CONFIG.bolTransporterCode}`);
    
    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error('CLIENT_ID and CLIENT_SECRET must be set in environment variables');
    }

    console.log('🔑 Getting access token...');
    const token = await getAccessToken();
    
    let shipments = [];
    let successCount = 0;
    let errorCount = 0;

    // Process provided order items
    if (orderItems && Array.isArray(orderItems)) {
      console.log(`📦 Creating shipments for ${orderItems.length} order items...`);
      
      for (const orderItem of orderItems) {
        try {
          // Use provided tracking code or generate one
          const trackAndTrace = orderItem.trackAndTrace || generatePostNLTrackingCode();
          const shippingLabelId = `PNL_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
          
          const shipmentData = {
            reference: `POSTNL_${orderItem.orderItemId}_${Date.now()}`,
            shippingLabelId: shippingLabelId,
            trackAndTrace: trackAndTrace,
            quantity: 1
          };

          const result = await createShipment(token, orderItem.orderItemId, shipmentData);
          
          shipments.push({
            orderItemId: orderItem.orderItemId,
            orderId: orderItem.orderId,
            shipmentId: result.shipmentId || `SHIP_${Date.now()}_${successCount}`,
            trackAndTrace: trackAndTrace,
            trackingUrl: `${POSTNL_CONFIG.trackingUrlPattern}${trackAndTrace}`,
            shippingLabelId: shippingLabelId,
            transporterCode: POSTNL_CONFIG.bolTransporterCode, // "TNT" for BOL.com
            actualCarrier: POSTNL_CONFIG.actualCarrier, // "PostNL" for display
            status: 'created',
            createdAt: new Date().toISOString(),
            customerName: `${orderItem.firstName || ''} ${orderItem.lastName || ''}`.trim(),
            address: orderItem.address || `${orderItem.street || ''} ${orderItem.houseNumber || ''}, ${orderItem.zipCode || ''} ${orderItem.city || ''}`,
            processStatusId: result.processStatusId,
            productCode: orderItem.productCode || '3085'
          });
          
          successCount++;
          console.log(`✅ Created PostNL shipment for order item ${orderItem.orderItemId} (tracking: ${trackAndTrace})`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to create shipment for ${orderItem.orderItemId}:`, error.message);
          
          shipments.push({
            orderItemId: orderItem.orderItemId,
            orderId: orderItem.orderId,
            status: 'failed',
            error: error.message,
            createdAt: new Date().toISOString(),
            customerName: `${orderItem.firstName || ''} ${orderItem.lastName || ''}`.trim()
          });
        }
      }
    } else {
      console.log('ℹ️ No order items provided for shipment creation');
      return {
        success: false,
        message: 'No order items provided for shipment creation',
        shipmentsCreated: 0,
        shipmentsErrored: 0,
        totalProcessed: 0,
        shipments: [],
        transporterInfo: POSTNL_CONFIG,
        timestamp: new Date().toISOString()
      };
    }

    console.log(`✅ PostNL shipment creation completed: ${successCount} successful, ${errorCount} failed`);

    return {
      success: successCount > 0,
      message: `Created ${successCount} PostNL shipments successfully${errorCount > 0 ? ` (${errorCount} failed)` : ''} using BOL transporter code: ${POSTNL_CONFIG.bolTransporterCode}`,
      shipmentsCreated: successCount,
      shipmentsErrored: errorCount,
      totalProcessed: successCount + errorCount,
      shipments: shipments,
      transporterInfo: {
        bolCode: POSTNL_CONFIG.bolTransporterCode,
        actualCarrier: POSTNL_CONFIG.actualCarrier,
        trackingUrlPattern: POSTNL_CONFIG.trackingUrlPattern
      },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Error in createShipments:', error);
    return {
      success: false,
      message: `Failed to create PostNL shipments: ${error.message}`,
      shipmentsCreated: 0,
      shipmentsErrored: 1,
      totalProcessed: 0,
      shipments: [],
      transporterInfo: POSTNL_CONFIG,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

// Export configuration for use in other modules
const transporterConfig = POSTNL_CONFIG;

module.exports = { createShipments, transporterConfig };