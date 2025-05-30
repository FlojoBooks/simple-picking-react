// src/App.js - Main React application component
import React, { useState, useEffect } from 'react';
import { Package, Truck, CheckCircle, Clock, User, LogOut, RefreshCw, MapPin, Download, FileText } from 'lucide-react';

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

  // Load orders from API
  useEffect(() => {
    if (isLoggedIn) {
      loadOrders();
    }
  }, [isLoggedIn]);

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

  const markItemPicked = async (orderId, itemId, productCode = '3085') => {
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
              item.id === itemId ? { ...item, picked: true, productCode } : item
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
        
        const packageType = productCode === '2928' ? 'mailbox package' : 'normal package';
        setMessage(`Item picked as ${packageType}!`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to mark item as picked: ' + result.message);
      }
    } catch (error) {
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

  const shipOrder = async (orderId) => {
    setLoading(true);
    setMessage('Creating PostNL shipping label...');
    
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
        const trackingNumber = result.trackingNumber;
        const labelFilename = result.labelFilename;
        
        // Update local state
        setOrders(orders.map(order => 
          order.id === orderId 
            ? { 
                ...order, 
                shipped: true, 
                trackingNumber, 
                status: 'shipped',
                labelFilename: labelFilename
              }
            : order
        ));
        
        setMessage(`Order shipped successfully! Tracking: ${trackingNumber}`);
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
              
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-md ${
            message.includes('success') || message.includes('shipped') || message.includes('picked') || message.includes('downloaded')
              ? 'bg-green-100 text-green-700' 
              : message.includes('Invalid')
              ? 'bg-red-100 text-red-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {message}
          </div>
        )}

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
                      
                      {order.trackingNumber && (
                        <div className="mt-2 p-2 bg-green-50 rounded-md">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-green-700">
                              <strong>Tracking:</strong> {order.trackingNumber}
                            </p>
                            {order.labelFilename && (
                              <button
                                onClick={() => downloadLabel(order.id, order.trackingNumber)}
                                className="ml-2 flex items-center gap-1 text-green-600 hover:text-green-800 text-sm"
                                title="Download shipping label"
                              >
                                <FileText className="w-4 h-4" />
                                <Download className="w-3 h-3" />
                              </button>
                            )}
                          </div>
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
                    {order.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{item.name}</span>
                            <span className="text-sm text-gray-500">({item.sku})</span>
                            <span className="text-sm text-gray-500">Qty: {item.quantity}</span>
                          </div>
                          <p className="text-sm text-blue-600 mt-1">Location: {item.location}</p>
                        </div>
                        
                        {!order.shipped && (
                          <button
                            onClick={() => handlePickItemClick(order.id, item.id)}
                            disabled={item.picked}
                            className={`px-3 py-1 rounded text-sm font-medium ${
                              item.picked
                                ? 'bg-green-100 text-green-800 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            {item.picked ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle className="w-4 h-4" />
                                Picked
                                {item.productCode && (
                                  <span className="ml-1 text-xs">
                                    ({item.productCode === '2928' ? 'Mailbox' : 'Normal'})
                                  </span>
                                )}
                              </span>
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
                    ))}
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
