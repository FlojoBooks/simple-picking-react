// src/App.js - Main React application component with enhanced label feedback and price update functionality
import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, User, LogOut, RefreshCw, MapPin, FileText, Download, Loader, DollarSign, TrendingUp, BarChart3 } from 'lucide-react';

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [showProductCodeModal, setShowProductCodeModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [labelCreationStatus, setLabelCreationStatus] = useState({}); // Track label creation per item
  const [showLabelAnimation, setShowLabelAnimation] = useState({}); // Track animations per item

  // Price update functionality state
  const [activeTab, setActiveTab] = useState('orders');
  const [priceUpdateProgress, setPriceUpdateProgress] = useState(null);
  const [priceReports, setPriceReports] = useState([]);
  const [updatingPrices, setUpdatingPrices] = useState(false);

  // Load orders from API
  useEffect(() => {
    if (isLoggedIn) {
      loadOrders();
    }
  }, [isLoggedIn]);

  // Load price reports when price tab is active
  useEffect(() => {
    if (isLoggedIn && activeTab === 'prices') {
      loadPriceReports();
    }
  }, [isLoggedIn, activeTab]);

  const handleLogin = async () => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setIsLoggedIn(true);
        setSessionId(result.sessionId);
        setMessage('Login successful!');
        setLoading(false);
      } else {
        setMessage(result.message || 'Login failed');
        setLoading(false);
      }
    } catch (error) {
      setMessage('Connection error. Please try again.');
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: {
          'x-session-id': sessionId
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    setMessage('');
    setSessionId('');
    setOrders([]);
    setLabelCreationStatus({});
    setShowLabelAnimation({});
    setActiveTab('orders');
    setPriceUpdateProgress(null);
    setPriceReports([]);
    setUpdatingPrices(false);
  };

  const fetchOrders = async () => {
    setLoading(true);
    setMessage('Fetching orders from BOL.com...');
    
    try {
      const response = await fetch('/api/fetch-orders', {
        method: 'POST',
        headers: {
          'x-session-id': sessionId,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage(`Successfully fetched ${result.ordersCount} orders!`);
        // Reload orders after fetching
        await loadOrders();
      } else {
        setMessage(result.message || 'Failed to fetch orders');
      }
    } catch (error) {
      setMessage('Error fetching orders: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    try {
      const response = await fetch('/api/orders', {
        headers: {
          'x-session-id': sessionId
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setOrders(result.orders || []);
      }
    } catch (error) {
      console.error('Error loading orders:', error);
    }
  };

  // Price update functions
  const startPriceUpdate = async () => {
    setUpdatingPrices(true);
    setMessage('Starting price update process...');
    
    try {
      const response = await fetch('/api/prices/update', {
        method: 'POST',
        headers: {
          'x-session-id': sessionId,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setMessage('Price update started successfully!');
        // Start polling for progress
        pollPriceProgress();
      } else {
        setMessage('Failed to start price update: ' + result.message);
        setUpdatingPrices(false);
      }
    } catch (error) {
      setMessage('Error starting price update: ' + error.message);
      setUpdatingPrices(false);
    }
  };

  const pollPriceProgress = async () => {
    try {
      const response = await fetch('/api/prices/progress', {
        headers: {
          'x-session-id': sessionId
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setPriceUpdateProgress(result.progress);
        
        if (result.progress.isRunning) {
          // Continue polling
          setTimeout(pollPriceProgress, 2000);
        } else {
          setUpdatingPrices(false);
          if (result.progress.stage === 'completed') {
            setMessage('Price update completed successfully!');
            loadPriceReports(); // Refresh reports list
          } else if (result.progress.stage === 'error') {
            setMessage('Price update failed: ' + result.progress.message);
          }
        }
      }
    } catch (error) {
      console.error('Error polling price progress:', error);
    }
  };

  const loadPriceReports = async () => {
    try {
      const response = await fetch('/api/prices/reports', {
        headers: {
          'x-session-id': sessionId
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        setPriceReports(result.reports || []);
      }
    } catch (error) {
      console.error('Error loading price reports:', error);
    }
  };

  const downloadPriceReport = async (filename) => {
    try {
      const response = await fetch(`/api/prices/reports/${filename}`, {
        headers: {
          'x-session-id': sessionId
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        setMessage('Price report downloaded successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to download report');
      }
    } catch (error) {
      setMessage('Error downloading report: ' + error.message);
    }
  };

  const markItemPicked = async (orderId, itemId, productCode = '3085') => {
    const itemKey = `${orderId}-${itemId}`;
    
    // Set loading state for this specific item
    setLabelCreationStatus(prev => ({
      ...prev,
      [itemKey]: 'creating'
    }));

    try {
      const response = await fetch(`/api/orders/${orderId}/items/${itemId}/pick`, {
        method: 'POST',
        headers: {
          'x-session-id': sessionId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ productCode })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update local state
        setOrders(orders.map(order => {
          if (order.id === orderId) {
            const updatedItems = order.items.map(item => 
              item.id === itemId ? { 
                ...item, 
                picked: true, 
                productCode,
                trackingNumber: result.trackingNumber,
                labelFilename: result.labelFilename,
                labelCreated: true
              } : item
            );
            const allPicked = updatedItems.every(item => item.picked);
            return {
              ...order,
              items: updatedItems,
              status: allPicked ? 'ready' : 'picking'
            };
          }
          return order;
        }));
        
        // Set success state and show animation
        setLabelCreationStatus(prev => ({
          ...prev,
          [itemKey]: 'success'
        }));

        // Show the label animation
        setShowLabelAnimation(prev => ({
          ...prev,
          [itemKey]: true
        }));

        // Hide animation after 3 seconds
        setTimeout(() => {
          setShowLabelAnimation(prev => ({
            ...prev,
            [itemKey]: false
          }));
        }, 3000);
        
        const packageType = productCode === '2928' ? 'mailbox package' : 'normal package';
        setMessage(`Item picked as ${packageType}! Label created with tracking: ${result.trackingNumber}`);
        setTimeout(() => setMessage(''), 5000);
      } else {
        setLabelCreationStatus(prev => ({
          ...prev,
          [itemKey]: 'error'
        }));
        setMessage('Failed to mark item as picked: ' + result.message);
      }
    } catch (error) {
      setLabelCreationStatus(prev => ({
        ...prev,
        [itemKey]: 'error'
      }));
      setMessage('Error marking item as picked: ' + error.message);
    }
  };

  const handlePickItemClick = (orderId, itemId) => {
    setSelectedItem({ orderId, itemId });
    setShowProductCodeModal(true);
  };

  const handleProductCodeSelect = (productCode) => {
    if (selectedItem) {
      markItemPicked(selectedItem.orderId, selectedItem.itemId, productCode);
    }
    setShowProductCodeModal(false);
    setSelectedItem(null);
  };

  const downloadItemLabel = async (orderId, itemId, trackingNumber) => {
    try {
      const response = await fetch(`/api/labels/item/${orderId}/${itemId}/${trackingNumber}`, {
        headers: {
          'x-session-id': sessionId
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `label_${orderId}_${itemId}_${trackingNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        setMessage(`Label downloaded: ${trackingNumber}`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to download label');
      }
    } catch (error) {
      setMessage('Error downloading label: ' + error.message);
    }
  };

  const shipOrder = async (orderId) => {
    setLoading(true);
    setMessage('Registering shipment with BOL.com...');
    
    try {
      const response = await fetch(`/api/orders/${orderId}/ship`, {
        method: 'POST',
        headers: {
          'x-session-id': sessionId,
          'Content-Type': 'application/json'
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update local state
        setOrders(orders.map(order => 
          order.id === orderId 
            ? { 
                ...order, 
                shipped: true, 
                trackingNumbers: result.trackingNumbers || [],
                status: 'shipped'
              }
            : order
        ));
        
        const trackingCount = result.trackingNumbers ? result.trackingNumbers.length : 0;
        setMessage(`Order shipped successfully! ${trackingCount} tracking numbers registered with BOL.com`);
      } else {
        setMessage('Failed to ship order: ' + result.message);
      }
    } catch (error) {
      setMessage('Error shipping order: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadLabel = async (orderId, trackingNumber) => {
    try {
      const response = await fetch(`/api/labels/${orderId}/${trackingNumber}`, {
        headers: {
          'x-session-id': sessionId
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `label_${orderId}_${trackingNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        setMessage('Label downloaded successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to download label');
      }
    } catch (error) {
      setMessage('Error downloading label: ' + error.message);
    }
  };

  const getOrderStatus = (order) => {
    if (order.shipped) return { text: 'Shipped', color: 'text-green-600', bg: 'bg-green-100' };
    if (order.status === 'ready') return { text: 'Ready to Ship', color: 'text-blue-600', bg: 'bg-blue-100' };
    if (order.status === 'picking') return { text: 'Picking', color: 'text-orange-600', bg: 'bg-orange-100' };
    return { text: 'Open', color: 'text-gray-600', bg: 'bg-gray-100' };
  };

  // Helper function to get item status
  const getItemStatus = (orderId, itemId) => {
    const itemKey = `${orderId}-${itemId}`;
    return labelCreationStatus[itemKey] || 'idle';
  };

  const getItemAnimation = (orderId, itemId) => {
    const itemKey = `${orderId}-${itemId}`;
    return showLabelAnimation[itemKey] || false;
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <Package className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">BOL.com Picking System</h1>
            <p className="text-gray-600">Simple order picking and shipping</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter username"
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter password"
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Logging in...
                </>
              ) : (
                <>
                  <User className="w-4 h-4" />
                  Login
                </>
              )}
            </button>
          </div>
          
          {message && (
            <div className={`mt-4 p-3 rounded-md text-sm ${
              message.includes('successful') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {message}
            </div>
          )}
          
          <div className="mt-6 p-3 bg-gray-100 rounded-md text-sm text-gray-600">
            <strong>Default Login:</strong><br />
            Username: admin<br />
            Password: admin123<br />
            <br />
            <strong>Note:</strong> Requires BOL.com and PostNL API credentials in environment variables for full functionality.
          </div>
        </div>
      </div>
    );
  }

  // Main Application
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Picking System</h1>
                <p className="text-sm text-gray-500">BOL.com + PostNL</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {activeTab === 'orders' && (
                <button
                  onClick={fetchOrders}
                  disabled={loading}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Fetch Orders
                </button>
              )}
              
              {activeTab === 'prices' && (
                <button
                  onClick={startPriceUpdate}
                  disabled={updatingPrices}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {updatingPrices ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <TrendingUp className="w-4 h-4" />
                  )}
                  Update Prices
                </button>
              )}
              
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
          
          {/* Navigation Tabs */}
          <div className="border-t border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('orders')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'orders'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Package className="w-4 h-4 inline mr-2" />
                Orders & Picking
              </button>
              
              <button
                onClick={() => setActiveTab('prices')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'prices'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <DollarSign className="w-4 h-4 inline mr-2" />
                Price Updates
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.includes('success') || message.includes('shipped') || message.includes('picked') || message.includes('downloaded') || message.includes('Label created') || message.includes('completed')
              ? 'bg-green-100 text-green-700' 
              : message.includes('Invalid') || message.includes('Failed') || message.includes('Error') || message.includes('failed')
              ? 'bg-red-100 text-red-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {message}
          </div>
        )}

        {/* Price Update Tab Content */}
        {activeTab === 'prices' && (
          <div className="space-y-6">
            {/* Price Update Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <TrendingUp className="w-8 h-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Price Updates</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {priceUpdateProgress?.successCount || 0}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <BarChart3 className="w-8 h-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Processed</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {priceUpdateProgress?.processedItems || 0}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <FileText className="w-8 h-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Reports</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {priceReports.length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Price Update Progress */}
            {priceUpdateProgress && priceUpdateProgress.isRunning && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Update Progress</h3>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">{priceUpdateProgress.message}</span>
                      <span className="text-gray-500">{priceUpdateProgress.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${priceUpdateProgress.progress}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Stage:</span>
                      <span className="ml-1 font-medium">{priceUpdateProgress.stage}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Processed:</span>
                      <span className="ml-1 font-medium">{priceUpdateProgress.processedItems}/{priceUpdateProgress.totalItems}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Success:</span>
                      <span className="ml-1 font-medium text-green-600">{priceUpdateProgress.successCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Errors:</span>
                      <span className="ml-1 font-medium text-red-600">{priceUpdateProgress.errorCount}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Price Reports */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Price Update Reports</h2>
              </div>
              
              <div className="p-6">
                {priceReports.length > 0 ? (
                  <div className="space-y-3">
                    {priceReports.map((report, index) => (
                      <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div>
                          <h4 className="font-medium text-gray-900">{report.filename}</h4>
                          <p className="text-sm text-gray-500">
                            Created: {new Date(report.created).toLocaleDateString()} at {new Date(report.created).toLocaleTimeString()}
                          </p>
                          <p className="text-sm text-gray-500">Size: {(report.size / 1024).toFixed(1)} KB</p>
                        </div>
                        
                        <button
                          onClick={() => downloadPriceReport(report.filename)}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Reports Available</h3>
                    <p className="text-gray-600 mb-4">Run a price update to generate your first report</p>
                    <button
                      onClick={startPriceUpdate}
                      disabled={updatingPrices}
                      className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
                    >
                      Start Price Update
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Orders Tab Content */}
        {activeTab === 'orders' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <Package className="w-8 h-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Orders</p>
                    <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <Clock className="w-8 h-8 text-orange-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">To Pick</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {orders.filter(o => !o.shipped && o.status !== 'ready').length}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <CheckCircle className="w-8 h-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Ready to Ship</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {orders.filter(o => o.status === 'ready' && !o.shipped).length}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-lg shadow-sm">
                <div className="flex items-center">
                  <Truck className="w-8 h-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Shipped</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {orders.filter(o => o.shipped).length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Orders List */}
            <div className="bg-white rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Orders</h2>
              </div>
              
              <div className="divide-y divide-gray-200">
                {orders.map(order => {
                  const status = getOrderStatus(order);
                  const allItemsPicked = order.items.every(item => item.picked);
                  
                  return (
                    <div key={order.id} className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{order.id}</h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                              {status.text}
                            </span>
                          </div>
                          
                          <p className="text-gray-700 font-medium">{order.customer}</p>
                          <div className="flex items-center gap-1 text-gray-600 text-sm mt-1">
                            <MapPin className="w-4 h-4" />
                            {order.address}
                          </div>
                          
                          {order.trackingNumbers && order.trackingNumbers.length > 0 && (
                            <div className="mt-2 p-2 bg-green-50 rounded-md">
                              <p className="text-sm text-green-700">
                                <strong>Tracking Numbers:</strong> {order.trackingNumbers.join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                        
                        {!order.shipped && allItemsPicked && (
                          <button
                            onClick={() => shipOrder(order.id)}
                            disabled={loading}
                            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            <Truck className="w-4 h-4" />
                            Ship Order
                          </button>
                        )}
                      </div>
                      
                      {/* Items */}
                      <div className="space-y-3">
                        <h4 className="font-medium text-gray-900">Items to pick:</h4>
                        {order.items.map(item => {
                          const itemStatus = getItemStatus(order.id, item.id);
                          const showAnimation = getItemAnimation(order.id, item.id);
                          
                          return (
                            <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <span className="font-medium">{item.name}</span>
                                  <span className="text-sm text-gray-500">({item.sku})</span>
                                  <span className="text-sm text-gray-500">Qty: {item.quantity}</span>
                                </div>
                                <p className="text-sm text-blue-600 mt-1">Location: {item.location}</p>
                                
                                {/* Label status and download */}
                                {item.picked && item.trackingNumber && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-xs text-green-600">
                                      📦 {item.trackingNumber}
                                    </span>
                                    {item.labelCreated && (
                                      <button
                                        onClick={() => downloadItemLabel(order.id, item.id, item.trackingNumber)}
                                        className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                                        title="Download label PDF"
                                      >
                                        <Download className="w-3 h-3" />
                                        Label PDF
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2">
                                {/* Label Animation */}
                                {showAnimation && (
                                  <div className="flex items-center gap-2 mr-2 p-2 bg-blue-100 rounded-md animate-pulse">
                                    <FileText className="w-4 h-4 text-blue-600 animate-bounce" />
                                    <span className="text-xs text-blue-700 font-medium">Label Created!</span>
                                  </div>
                                )}
                                
                                {!order.shipped && (
                                  <button
                                    onClick={() => handlePickItemClick(order.id, item.id)}
                                    disabled={item.picked || itemStatus === 'creating'}
                                    className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-1 ${
                                      item.picked
                                        ? 'bg-green-100 text-green-800 cursor-not-allowed'
                                        : itemStatus === 'creating'
                                        ? 'bg-yellow-100 text-yellow-800 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                  >
                                    {itemStatus === 'creating' ? (
                                      <>
                                        <Loader className="w-4 h-4 animate-spin" />
                                        Creating Label...
                                      </>
                                    ) : item.picked ? (
                                      <>
                                        <CheckCircle className="w-4 h-4" />
                                        Picked
                                        {item.productCode && (
                                          <span className="ml-1 text-xs">
                                            ({item.productCode === '2928' ? 'Mailbox' : 'Normal'})
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      'Pick Item'
                                    )}
                                  </button>
                                )}
                                
                                {order.shipped && (
                                  <span className="flex items-center gap-1 text-green-600 text-sm">
                                    <CheckCircle className="w-4 h-4" />
                                    Shipped
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {orders.length === 0 && (
                <div className="p-12 text-center">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No orders available</h3>
                  <p className="text-gray-600 mb-4">Click "Fetch Orders" to load orders from BOL.com API</p>
                  <button
                    onClick={fetchOrders}
                    disabled={loading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Fetch Orders from BOL.com
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Product Code Selection Modal */}
      {showProductCodeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Package Type</h3>
            <p className="text-gray-600 mb-6">Choose the appropriate package type for shipping:</p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleProductCodeSelect('3085')}
                className="w-full p-4 text-left border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <div className="font-medium text-gray-900">Normal Package (3085)</div>
                <div className="text-sm text-gray-600">Standard package delivery</div>
              </button>
              
              <button
                onClick={() => handleProductCodeSelect('2928')}
                className="w-full p-4 text-left border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                <div className="font-medium text-gray-900">Mailbox Package (2928)</div>
                <div className="text-sm text-gray-600">Fits through mailbox</div>
              </button>
            </div>
            
            <button
              onClick={() => {
                setShowProductCodeModal(false);
                setSelectedItem(null);
              }}
              className="w-full mt-4 px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
