// scripts/postnl-create-labels.js - Simplified PostNL label creation
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PostNL API Configuration
const POSTNL_CONFIG = {
  API_KEY: process.env.API_KEY,
  API_URL: process.env.API_URL || 'https://api-sandbox.postnl.nl',
  CUSTOMER_NUMBER: process.env.CUSTOMER_NUMBER,
  CUSTOMER_CODE: process.env.CUSTOMER_CODE,
  COLLECTION_LOCATION: process.env.COLLECTION_LOCATION
};

// Sender information
const SENDER_INFO = {
  companyName: process.env.COMPANY_NAME || 'Your Company',
  firstName: '',
  lastName: process.env.SENDER_NAME || 'Shipping Department',
  street: process.env.COMPANY_STREET || 'Logistics Street',
  houseNumber: process.env.COMPANY_HOUSENR || '1',
  houseNumberExt: process.env.COMPANY_HOUSEEXT || '',
  zipcode: process.env.COMPANY_ZIP || '1234AB',
  city: process.env.COMPANY_CITY || 'Amsterdam',
  countryCode: process.env.COMPANY_COUNTRY || 'NL',
  email: process.env.SENDER_EMAIL || 'shipping@company.com'
};

// Labels directory
const LABELS_DIR = path.join(__dirname, '..', 'uploads', 'labels');

// Ensure labels directory exists
async function ensureLabelsDirectory() {
  try {
    await fs.access(LABELS_DIR);
  } catch {
    await fs.mkdir(LABELS_DIR, { recursive: true });
    console.log(`📁 Created labels directory: ${LABELS_DIR}`);
  }
}

// Validate PostNL configuration
function validatePostNLConfig() {
  const requiredFields = ['API_KEY', 'CUSTOMER_NUMBER', 'CUSTOMER_CODE', 'COLLECTION_LOCATION'];
  const missingFields = requiredFields.filter(field => !POSTNL_CONFIG[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`PostNL configuration incomplete. Missing: ${missingFields.join(', ')}`);
  }
  
  console.log('✅ PostNL configuration validated');
}

// Generate PostNL tracking code
function generatePostNLTrackingCode() {
  const characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let trackingCode = '3S';
  
  for (let i = 0; i < 13; i++) {
    trackingCode += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  const finalCode = trackingCode + 'NL';
  console.log(`📦 Generated tracking code: ${finalCode}`);
  return finalCode;
}

// Validate tracking code format
function validateTrackingCode(trackingCode) {
  const pattern = /^3S[0-9A-Z]{13}NL$/;
  return pattern.test(trackingCode);
}

// Create PostNL shipping label
async function createPostNLLabel(shipmentData) {
  try {
    if (!shipmentData.receiver) {
      throw new Error('Receiver information is required');
    }
    
    const apiUrl = `${POSTNL_CONFIG.API_URL}/shipment/v2_2/label`;
    const messageId = shipmentData.messageId || `MSG_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const trackingCode = shipmentData.trackingCode || generatePostNLTrackingCode();
    
    if (!validateTrackingCode(trackingCode)) {
      console.warn(`⚠️ Invalid tracking code format: ${trackingCode}`);
    }

    // Prepare delivery date (tomorrow by default)
    const deliveryDate = shipmentData.deliveryDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    // Build the label payload
    const labelPayload = {
      Customer: {
        CustomerNumber: POSTNL_CONFIG.CUSTOMER_NUMBER,
        CustomerCode: POSTNL_CONFIG.CUSTOMER_CODE,
        CollectionLocation: POSTNL_CONFIG.COLLECTION_LOCATION
      },
      Message: {
        MessageID: messageId,
        MessageTimeStamp: new Date().toISOString(),
        Printertype: 'GraphicFile|PDF'
      },
      Shipments: [{
        Addresses: [
          {
            AddressType: '01', // Sender
            CompanyName: SENDER_INFO.companyName,
            FirstName: SENDER_INFO.firstName,
            Name: SENDER_INFO.lastName,
            Street: SENDER_INFO.street,
            HouseNr: SENDER_INFO.houseNumber,
            HouseNrExt: SENDER_INFO.houseNumberExt,
            Zipcode: SENDER_INFO.zipcode,
            City: SENDER_INFO.city,
            Countrycode: SENDER_INFO.countryCode,
            Email: SENDER_INFO.email
          },
          {
            AddressType: '02', // Receiver
            CompanyName: shipmentData.receiver.companyName || '',
            FirstName: shipmentData.receiver.firstName || '',
            Name: shipmentData.receiver.lastName || 'Receiver',
            Street: shipmentData.receiver.street || '',
            HouseNr: shipmentData.receiver.houseNumber || '1',
            HouseNrExt: shipmentData.receiver.houseNumberExt || '',
            Zipcode: shipmentData.receiver.zipcode || '1000AA',
            City: shipmentData.receiver.city || 'Amsterdam',
            Countrycode: shipmentData.receiver.countryCode || 'NL',
            Email: shipmentData.receiver.email || ''
          }
        ],
        ProductCodeDelivery: shipmentData.productCode || '3085',
        PhaseCode: '1',
        Reference: shipmentData.reference || trackingCode,
        DeliveryDate: deliveryDate,
        Barcode: trackingCode,
        Dimension: {
          Weight: parseInt(shipmentData.weight) || parseInt(process.env.DEFAULT_WEIGHT) || 1000
        },
        ProductOptions: [
          {
            Option: '01',
            Characteristic: shipmentData.productCode === '2928' ? '006' : '118'
          }
        ]
      }]
    };

    console.log(`📮 Creating PostNL label for ${shipmentData.receiver.firstName} ${shipmentData.receiver.lastName}`);
    console.log(`   📦 Product: ${shipmentData.productCode || '3085'}`);
    console.log(`   📍 Address: ${shipmentData.receiver.street} ${shipmentData.receiver.houseNumber}, ${shipmentData.receiver.zipcode} ${shipmentData.receiver.city}`);
    console.log(`   🏷️ Tracking: ${trackingCode}`);

    const response = await axios.post(apiUrl, labelPayload, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'apikey': POSTNL_CONFIG.API_KEY
      },
      timeout: 30000
    });

    console.log(`✅ PostNL API response received for ${trackingCode}`);
    
    // Extract final tracking code from response
    let finalTrackingCode = trackingCode;
    if (response.data.ResponseShipments && response.data.ResponseShipments.length > 0) {
      const responseShipment = response.data.ResponseShipments[0];
      if (responseShipment.Barcode) {
        finalTrackingCode = responseShipment.Barcode;
        console.log(`📦 Final tracking code from PostNL: ${finalTrackingCode}`);
      }
    }

    return {
      ...response.data,
      trackingCode: finalTrackingCode,
      messageId: messageId,
      success: true
    };

  } catch (error) {
    console.error('❌ PostNL API Error:', error.response?.data || error.message);
    
    // Enhanced error handling
    if (error.response?.data?.fault) {
      throw new Error(`PostNL API error: ${error.response.data.fault.faultstring}`);
    } else if (error.response?.status === 401) {
      throw new Error('PostNL API authentication failed. Check your API key.');
    } else if (error.response?.status === 400) {
      throw new Error(`PostNL API bad request: ${error.response.data?.message || 'Invalid request data'}`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to PostNL API. Check your internet connection and API URL.');
    } else {
      throw new Error(`PostNL API error: ${error.message}`);
    }
  }
}

// Save label PDF
async function saveLabelPDF(labelData, orderId, trackingCode) {
  try {
    if (!labelData.Labels || labelData.Labels.length === 0) {
      console.warn('⚠️ No label data found in response');
      return null;
    }
    
    const label = labelData.Labels[0];
    if (!label.Content) {
      console.warn('⚠️ No label content found in response');
      return null;
    }
    
    // Ensure labels directory exists
    await ensureLabelsDirectory();
    
    // The label content is base64 encoded PDF
    const pdfBuffer = Buffer.from(label.Content, 'base64');
    
    // Create filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const filename = `label_${orderId}_${trackingCode}_${timestamp}.pdf`;
    const filePath = path.join(LABELS_DIR, filename);
    
    await fs.writeFile(filePath, pdfBuffer);
    
    console.log(`💾 Label PDF saved: ${filename} (${pdfBuffer.length} bytes)`);
    return filePath;
    
  } catch (error) {
    console.error('❌ Error saving label PDF:', error);
    return null;
  }
}

// Main export function
export async function createLabels(shipments = null) {
  try {
    console.log('🚀 Starting PostNL label creation...');
    
    // Validate PostNL configuration
    validatePostNLConfig();
    
    // Ensure labels directory exists
    await ensureLabelsDirectory();
    
    let labels = [];
    let successCount = 0;
    let errorCount = 0;

    // Process provided shipments
    if (shipments && Array.isArray(shipments) && shipments.length > 0) {
      console.log(`📦 Creating labels for ${shipments.length} shipments...`);
      
      for (let i = 0; i < shipments.length; i++) {
        const shipment = shipments[i];
        
        console.log(`\n🔄 Processing shipment ${i + 1}/${shipments.length}: Order ${shipment.orderId || 'Unknown'}`);
        
        try {
          // Validate shipment data
          if (!shipment.orderId) {
            throw new Error('Order ID is required');
          }
          
          // Prepare shipment data
          const messageId = `MSG_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const trackingCode = generatePostNLTrackingCode();
          
          const shipmentData = {
            messageId: messageId,
            trackingCode: trackingCode,
            receiver: {
              companyName: shipment.companyName || '',
              firstName: shipment.firstName || 'Customer',
              lastName: shipment.lastName || 'Customer',
              street: shipment.street || 'Unknown Street',
              houseNumber: shipment.houseNumber || '1',
              houseNumberExt: shipment.houseNumberExt || '',
              zipcode: shipment.zipcode || '1000AA',
              city: shipment.city || 'Amsterdam',
              countryCode: shipment.countryCode || 'NL',
              email: shipment.email || ''
            },
            productCode: shipment.productCode || '3085',
            reference: shipment.orderId || trackingCode,
            weight: parseInt(shipment.weight) || 1000
          };

          // Create the label via PostNL API
          const result = await createPostNLLabel(shipmentData);
          
          if (!result.success) {
            throw new Error('PostNL API returned error response');
          }
          
          // Save PDF label
          const labelPath = await saveLabelPDF(result, shipment.orderId, result.trackingCode || trackingCode);
          const labelFilename = labelPath ? path.basename(labelPath) : null;
          
          // Store label information
          labels.push({
            orderId: shipment.orderId,
            orderItemId: shipment.orderItemId,
            messageId: messageId,
            trackAndTrace: result.trackingCode || trackingCode,
            labelPath: labelPath,
            labelFilename: labelFilename,
            status: 'created',
            createdAt: new Date().toISOString(),
            customerName: `${shipment.firstName || ''} ${shipment.lastName || ''}`.trim(),
            address: `${shipment.street || ''} ${shipment.houseNumber || ''}, ${shipment.zipcode || ''} ${shipment.city || ''}`,
            productCode: shipmentData.productCode,
            weight: shipmentData.weight,
            printed: false, // Simplified - no printing integration
            printMessage: 'Label created successfully',
            trackingUrl: `https://postnl.nl/tracktrace/?B=${result.trackingCode || trackingCode}`,
            
            // Enhanced metadata
            apiResponse: {
              messageId: result.messageId,
              success: result.success
            },
            processingTime: new Date().toISOString(),
            fileSize: labelPath ? (await fs.stat(labelPath)).size : 0
          });
          
          successCount++;
          console.log(`✅ Label created successfully for order ${shipment.orderId}`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to create label for order ${shipment.orderId}:`, error.message);
          
          labels.push({
            orderId: shipment.orderId,
            orderItemId: shipment.orderItemId,
            status: 'failed',
            error: error.message,
            createdAt: new Date().toISOString(),
            customerName: `${shipment.firstName || ''} ${shipment.lastName || ''}`.trim(),
            printed: false,
            printMessage: 'Label creation failed',
            
            // Error metadata
            errorDetails: {
              message: error.message,
              timestamp: new Date().toISOString()
            }
          });
        }
      }
    } else {
      return {
        success: false,
        message: 'No shipments provided for label creation',
        labelsCreated: 0,
        labelsErrored: 0,
        totalProcessed: 0,
        labels: [],
        timestamp: new Date().toISOString()
      };
    }

    console.log(`\n✅ PostNL label creation completed: ${successCount} successful, ${errorCount} failed`);
    console.log(`📁 Labels saved to: ${LABELS_DIR}`);

    return {
      success: successCount > 0,
      message: `Created ${successCount} PostNL shipping labels${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
      labelsCreated: successCount,
      labelsErrored: errorCount,
      totalProcessed: successCount + errorCount,
      labels: labels,
      labelsDirectory: LABELS_DIR,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ Critical error in createLabels:', error.message);
    
    return {
      success: false,
      message: `Label creation failed: ${error.message}`,
      labelsCreated: 0,
      labelsErrored: 1,
      totalProcessed: 0,
      labels: [],
      labelsDirectory: LABELS_DIR,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}