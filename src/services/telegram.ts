import TelegramBot from 'node-telegram-bot-api';
import { db } from '../config/database';
import { env } from '../config/env';

let bot: TelegramBot | null = null;
let chatId: string | number | null = env.telegramChatId || null;

function initBot(): TelegramBot | null {
  if (!env.telegramBotToken) {
    console.warn('TELEGRAM_BOT_TOKEN not set — notifications disabled until configured');
    return null;
  }
  try {
    const instance = new TelegramBot(env.telegramBotToken, {
      polling: {
        interval: 1000,
        autoStart: true,
        params: { timeout: 10 },
      },
    });

    instance.on('polling_error', (error) => {
      console.error('Telegram polling error:', error.message);
    });

    instance.on('message', (msg) => {
      if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        if (!chatId || chatId !== msg.chat.id) {
          chatId = msg.chat.id;
          console.log(`Telegram chat linked: ${chatId} (${msg.chat.title})`);
          instance.sendMessage(
            chatId,
            'SOMAHLAND bot is active. New order notifications will appear here.'
          );
        }
      }
    });

    instance.on('callback_query', async (callbackQuery) => {
      try {
        const data = callbackQuery.data || '';
        if (data === 'handled') {
          await instance.answerCallbackQuery(callbackQuery.id, {
            text: 'Already assigned',
          });
          return;
        }
        const [action, orderId, handler] = data.split('_');
        if (action !== 'handle' || !orderId || !handler) return;

        const handlerName = handler.charAt(0).toUpperCase() + handler.slice(1);
        const { data: order } = await db
          .from('orders')
          .select('*, order_items(*)')
          .eq('id', orderId)
          .single();

        if (!order || !callbackQuery.message) return;

        const updated = formatOrderMessage(order, handlerName);
        await instance.editMessageText(updated, {
          chat_id: callbackQuery.message.chat.id,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: `Handled by ${handlerName}`, callback_data: 'handled' }]],
          },
        });
        await instance.answerCallbackQuery(callbackQuery.id, {
          text: `Assigned to ${handlerName}`,
        });
      } catch (err) {
        console.error('Telegram callback error:', err);
      }
    });

    console.log('Telegram bot initialized');
    return instance;
  } catch (err) {
    console.error('Failed to init Telegram bot:', err);
    return null;
  }
}

type OrderRow = {
  id: string;
  order_number: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  emirate: string;
  total_amount: number;
  delivery_fee: number;
  payment_method: string;
  notes?: string | null;
  vehicle_snapshot?: Record<string, unknown> | null;
  order_items?: Array<{
    product_name: string;
    part_number?: string | null;
    brand?: string | null;
    quantity: number;
    unit_price: number;
    fitment_status?: string | null;
  }>;
};

export function formatOrderMessage(order: OrderRow, handledBy: string | null = null): string {
  const vehicle = order.vehicle_snapshot || {};
  const vehicleLine = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') || 'Not provided';
  const vinLine = (vehicle.vin as string) || 'Not provided';

  let message = `🔔 <b>NEW SOMAHLAND ORDER</b>\n`;
  message += `Order #${order.order_number}\n`;
  message += `━━━━━━━━━━━━━━━━━━\n\n`;
  message += `<b>Customer:</b>\n${order.full_name}\n${order.phone}\n\n`;
  message += `<b>Vehicle:</b>\n${vehicleLine}\n`;
  message += `<b>VIN:</b> ${vinLine}\n\n`;
  message += `<b>Parts:</b>\n`;
  for (const item of order.order_items || []) {
    message += `• ${item.quantity}× ${item.product_name}`;
    if (item.part_number) message += ` [${item.part_number}]`;
    message += ` — AED ${item.unit_price}`;
    if (item.fitment_status) message += ` (${item.fitment_status})`;
    message += `\n`;
  }
  message += `\n<b>Delivery:</b>\n${order.address_line1}`;
  if (order.address_line2) message += `, ${order.address_line2}`;
  message += `\n${order.city}, ${order.emirate}\n\n`;
  message += `<b>Total:</b> AED ${order.total_amount}\n`;
  message += `<b>Delivery fee:</b> AED ${order.delivery_fee}\n`;
  message += `<b>Payment:</b> ${order.payment_method}\n`;
  if (order.notes) message += `\nNotes: ${order.notes}\n`;
  if (handledBy) message += `\n✅ Handled by: <b>${handledBy}</b>\n`;
  return message;
}

export async function sendOrderNotification(orderId: string): Promise<void> {
  if (!bot) bot = initBot();
  if (!bot) return;
  if (!chatId) {
    console.warn('Telegram chat ID not set — waiting for group message or TELEGRAM_CHAT_ID');
    return;
  }

  const { data: order, error } = await db
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .single();

  if (error || !order) {
    console.error('Telegram: failed to load order', error);
    return;
  }

  await bot.sendMessage(chatId, formatOrderMessage(order as OrderRow), {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Handled by Ops', callback_data: `handle_${orderId}_ops` },
          { text: 'Handled by Admin', callback_data: `handle_${orderId}_admin` },
        ],
      ],
    },
  });

  await db
    .from('telegram_notifications')
    .update({ sent: true, sent_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('sent', false);

  console.log(`Telegram notification sent for #${(order as OrderRow).order_number}`);
}

async function pollNotifications(): Promise<void> {
  const { data, error } = await db
    .from('telegram_notifications')
    .select('*')
    .eq('sent', false)
    .eq('notification_type', 'new_order')
    .order('created_at', { ascending: true })
    .limit(10);

  if (error || !data?.length) return;

  for (const notification of data) {
    await sendOrderNotification(notification.order_id);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

export function startTelegramWorker(): void {
  bot = initBot();
  setInterval(() => {
    void pollNotifications();
  }, 10000);
  void pollNotifications();
}

if (require.main === module) {
  startTelegramWorker();
  console.log('Telegram worker running standalone');
}
