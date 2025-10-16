require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const { supabaseAdmin } = require('./supabase');

// Load Telegram bot token
const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error('❌ ERROR: Missing TELEGRAM_BOT_TOKEN!');
  console.error('Please ensure Backend/.env file contains:');
  console.error('  - TELEGRAM_BOT_TOKEN');
  process.exit(1);
}

// Initialize bot
const bot = new TelegramBot(botToken, { polling: true });

// This will be set dynamically when the bot receives messages from the group
let CHAT_ID = null;

// Team members
const TEAM_MEMBERS = ['Khaled', 'Hamad', 'Malil'];

/**
 * Format order details into a nice Telegram message
 */
async function formatOrderMessage(order, handledBy = null) {
  const orderItems = order.order_items || [];
  
  // Group items by store
  const storeGroups = {};
  orderItems.forEach(item => {
    if (!storeGroups[item.store_name]) {
      storeGroups[item.store_name] = [];
    }
    storeGroups[item.store_name].push(item);
  });
  
  // Calculate commission (subtract 20 AED delivery fee first, then 5% commission)
  const amountAfterDeliveryFee = order.total_amount - 20; // Remove delivery fee
  const commission = (amountAfterDeliveryFee * 0.05).toFixed(2);
  const storePayout = (amountAfterDeliveryFee - commission).toFixed(2);
  
  // Build message
  let message = `🛍️ <b>NEW ORDER #${order.order_number}</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  // Customer Details
  message += `👤 <b>CUSTOMER DETAILS:</b>\n`;
  message += `Name: ${order.full_name}\n`;
  message += `Phone: ${order.phone}\n`;
  message += `Address: ${order.address_line1}`;
  if (order.address_line2) message += `, ${order.address_line2}`;
  message += `\n${order.city}, ${order.emirate}\n\n`;
  
  // Order Details (grouped by store)
  message += `📦 <b>ORDER DETAILS:</b>\n`;
  Object.entries(storeGroups).forEach(([storeName, items]) => {
    message += `<b>Store: ${storeName}</b>\n`;
    items.forEach(item => {
      message += `- ${item.quantity}x ${item.product_name} (AED ${item.price})\n`;
    });
    message += `\n`;
  });
  
  // Financial Breakdown
  message += `💰 <b>FINANCIAL BREAKDOWN:</b>\n`;
  message += `Total Amount: AED ${order.total_amount} (includes 20 AED delivery fee)\n`;
  message += `After Delivery Fee: AED ${amountAfterDeliveryFee}\n`;
  message += `5% Commission: AED ${commission} (Somah)\n`;
  message += `Store Payout: AED ${storePayout}\n\n`;
  
  // Store Pickup Details (for each store)
  message += `🏪 <b>STORE PICKUP DETAILS:</b>\n`;
  
  // Get unique stores from order items
  const uniqueStores = {};
  orderItems.forEach(item => {
    if (item.store_id && !uniqueStores[item.store_id]) {
      uniqueStores[item.store_id] = item.store_name;
    }
  });
  
  // Fetch store location details for each store
  for (const [storeId, storeName] of Object.entries(uniqueStores)) {
    // Try to get store location data
    const { data: storeLocation } = await supabaseAdmin
      .from('store_locations')
      .select('*')
      .eq('store_id', storeId)
      .single();
    
    message += `<b>${storeName}:</b>\n`;
    
    if (storeLocation && storeLocation.location_type) {
      message += `📍 ${storeLocation.location_type.charAt(0).toUpperCase() + storeLocation.location_type.slice(1)}\n`;
      message += `🏠 ${storeLocation.street_number} ${storeLocation.street_name}\n`;
      message += `📍 ${storeLocation.place_name}\n`;
      if (storeLocation.additional_info) {
        message += `📝 ${storeLocation.additional_info}\n`;
      }
    } else {
      // If no location found, show a generic message
      message += `📍 Store Location: Contact store owner for pickup details\n`;
      message += `📞 Store Contact: Available in store management\n`;
    }
    message += `\n`;
  }
  
  // Order Date
  const orderDate = new Date(order.created_at);
  message += `📅 <b>Order Date:</b> ${orderDate.toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}\n`;
  
  // Payment Method
  message += `💳 <b>Payment:</b> ${order.payment_method === 'cash_on_delivery' ? 'Cash on Delivery' : order.payment_method}\n`;
  
  // Add notes if any
  if (order.notes) {
    message += `📝 <b>Notes:</b> ${order.notes}\n`;
  }
  
  // Show who handled it
  if (handledBy) {
    message += `\n✅ <b>Handled by: ${handledBy}</b>\n`;
  }
  
  message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━`;
  
  return message;
}

/**
 * Create inline keyboard with team member buttons
 */
function createHandlerKeyboard(orderId) {
  return {
    inline_keyboard: [
      TEAM_MEMBERS.map(member => ({
        text: `👤 Handled by ${member}`,
        callback_data: `handle_${orderId}_${member.toLowerCase()}`
      }))
    ]
  };
}

/**
 * Create disabled keyboard showing who handled it
 */
function createHandledKeyboard(handler) {
  return {
    inline_keyboard: [
      [{
        text: `✅ Handled by ${handler}`,
        callback_data: 'handled'
      }]
    ]
  };
}

/**
 * Send order notification to Telegram
 */
async function sendOrderNotification(orderId) {
  try {
    // Check if we have a chat ID
    if (!CHAT_ID) {
      console.warn('⚠️ No CHAT_ID set yet. Waiting for bot to be added to a group...');
      return;
    }
    
    // Fetch order details with items
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items (
          product_name,
          quantity,
          price,
          original_price,
          store_name,
          store_id,
          image_url
        )
      `)
      .eq('id', orderId)
      .single();
    
    if (error) {
      console.error('Error fetching order:', error);
      return;
    }
    
    // Format message
    const message = await formatOrderMessage(order);
    
    // Send to Telegram with inline buttons
    const sentMessage = await bot.sendMessage(CHAT_ID, message, {
      parse_mode: 'HTML',
      reply_markup: createHandlerKeyboard(orderId)
    });
    
    // Update notification as sent in database
    await supabaseAdmin
      .from('telegram_notifications')
      .update({
        sent: true,
        sent_at: new Date().toISOString()
      })
      .eq('order_id', orderId);
    
    console.log(`✅ Order notification sent for #${order.order_number}`);
    
    return sentMessage;
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
  }
}

/**
 * Handle incoming messages to capture chat ID
 */
bot.on('message', (msg) => {
  // If this is a group or supergroup, save its chat ID
  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    if (!CHAT_ID || CHAT_ID !== msg.chat.id) {
      CHAT_ID = msg.chat.id;
      console.log(`✅ Bot added to group! Chat ID: ${CHAT_ID}`);
      console.log(`Group name: ${msg.chat.title}`);
      bot.sendMessage(CHAT_ID, '🤖 Somah Land Bot is now active! I will send order notifications here.');
    }
  }
});

/**
 * Handle button clicks (callback queries)
 */
bot.on('callback_query', async (callbackQuery) => {
  try {
    const data = callbackQuery.data;
    
    // Ignore if already handled
    if (data === 'handled') {
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '✅ This order is already assigned',
        show_alert: false
      });
      return;
    }
    
    // Parse callback data: handle_orderId_handler
    const [action, orderId, handler] = data.split('_');
    
    if (action !== 'handle') return;
    
    // Capitalize handler name
    const handlerName = handler.charAt(0).toUpperCase() + handler.slice(1);
    
    // Fetch order again to update message
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        order_items (
          product_name,
          quantity,
          price,
          original_price,
          store_name,
          store_id
        )
      `)
      .eq('id', orderId)
      .single();
    
    if (error) {
      console.error('Error fetching order:', error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ Error updating order',
        show_alert: true
      });
      return;
    }
    
    // Update the message with handler info
    const updatedMessage = await formatOrderMessage(order, handlerName);
    
    await bot.editMessageText(updatedMessage, {
      chat_id: callbackQuery.message.chat.id,
      message_id: callbackQuery.message.message_id,
      parse_mode: 'HTML',
      reply_markup: createHandledKeyboard(handlerName)
    });
    
    // Send confirmation popup
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: `✅ Order assigned to ${handlerName}`,
      show_alert: false
    });
    
    console.log(`✅ Order ${order.order_number} assigned to ${handlerName}`);
    
  } catch (error) {
    console.error('Error handling callback query:', error);
    await bot.answerCallbackQuery(callbackQuery.id, {
      text: '❌ An error occurred',
      show_alert: true
    });
  }
});

/**
 * Poll for unsent notifications and send them
 */
async function pollNotifications() {
  try {
    const { data: notifications, error } = await supabaseAdmin
      .from('telegram_notifications')
      .select('*')
      .eq('sent', false)
      .eq('notification_type', 'new_order')
      .order('created_at', { ascending: true })
      .limit(10);
    
    if (error) {
      console.error('Error fetching notifications:', error);
      return;
    }
    
    for (const notification of notifications) {
      await sendOrderNotification(notification.order_id);
      // Wait a bit between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.error('Error polling notifications:', error);
  }
}

// Start polling for notifications every 10 seconds
setInterval(pollNotifications, 10000);

// Initial poll
pollNotifications();

// Test database connection on startup
async function testDatabaseConnection() {
  try {
    const { data, error } = await supabaseAdmin
      .from('store_locations')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Database connection test failed:', error);
    } else {
      console.log('✅ Database connection successful');
    }
  } catch (err) {
    console.error('❌ Database connection error:', err);
  }
}

// Only log if running as standalone script (not imported as module)
if (require.main === module) {
  console.log('🤖 Telegram bot started and polling for notifications...');
  console.log('📱 Waiting for bot to be added to a group...');
  console.log('💡 Add the bot to your Telegram group and send a message to activate it.');
  
  // Test database connection
  testDatabaseConnection();
}

module.exports = {
  sendOrderNotification,
  bot
};
