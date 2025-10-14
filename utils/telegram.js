/**
 * Utility for sending notifications to Telegram
 */

/**
 * Send a notification message to the configured Telegram chat
 * @param {string} message - The message to send (can include HTML formatting)
 * @returns {Promise<object|null>} - The response from Telegram API or null if error
 */
async function sendTelegramNotification(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  
  if (!botToken || !chatId) {
    console.error('Telegram configuration missing');
    return null;
  }
  
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      }
    );
    
    const data = await response.json();
    
    if (!data.ok) {
      console.error('Failed to send Telegram notification:', data);
    }
    
    return data;
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
    return null;
  }
}

/**
 * Format an order notification message
 * @param {object} order - The order object
 * @returns {string} - Formatted HTML message
 */
function formatOrderNotification(order) {
  return `
<b>🛍️ NEW ORDER #${order.order_number}</b>

<b>Customer:</b> ${order.customer_name}
<b>Total:</b> AED ${order.total_amount}
<b>Items:</b> ${order.items.length}
<b>Delivery to:</b> ${order.delivery_address}

<b>Products:</b>
${order.items.map(item => `- ${item.quantity}x ${item.product_name} (AED ${item.price})`).join('\n')}

<a href="https://somahland.com/admin/orders/${order.id}">View Order Details</a>
`;
}

module.exports = { 
  sendTelegramNotification,
  formatOrderNotification
};
