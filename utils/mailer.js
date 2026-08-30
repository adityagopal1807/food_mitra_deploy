// Sends via Brevo's HTTPS transactional email API instead of raw Gmail
// SMTP. Render's free tier blocks outbound SMTP ports (25, 465, 587), which
// is why OTP emails were timing out. Brevo sends over plain HTTPS (port
// 443), which Render does not block.
//
// Requires two env vars:
//   BREVO_API_KEY      - from Brevo dashboard > SMTP & API > API keys & MCP
//   BREVO_SENDER_EMAIL - the address verified in Brevo > Senders, Domains & IPs

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// All notification emails go through this. Failures are logged, never
// thrown — a lister/buyer notification email going down should never take
// the actual listing/order action down with it.
async function safeSend(mailOptions) {
  try {
    if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
      throw new Error('BREVO_API_KEY / BREVO_SENDER_EMAIL are not set — cannot send emails.');
    }

    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: 'FoodMitra', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: mailOptions.to }],
        subject: mailOptions.subject,
        htmlContent: mailOptions.html,
        textContent: mailOptions.text
      })
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo API responded ${res.status}: ${body}`);
    }
  } catch (err) {
    console.error(`Email send failed (to: ${mailOptions.to}, subject: "${mailOptions.subject}"):`, err.message);
  }
}

function wrapEmail(heading, bodyHtml) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#e11d2e;margin-bottom:16px;">FoodMitra</h2>
      <h3 style="color:#111;margin-bottom:12px;">${heading}</h3>
      ${bodyHtml}
      <p style="color:#999;font-size:0.8rem;margin-top:28px;">You're receiving this because it relates to activity on your FoodMitra account.</p>
    </div>
  `;
}

async function sendOtpEmail(toEmail, otp) {
  await safeSend({
    to: toEmail,
    subject: 'Your FoodMitra login code',
    text: `Your FoodMitra login code is ${otp}. It expires in 5 minutes. If you did not request this, you can safely ignore this email.`,
    html: wrapEmail('Your login code', `
      <p style="color:#333;">Your one-time login code is:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111;margin:16px 0;">${otp}</p>
      <p style="color:#666;font-size:0.9rem;">This code expires in 5 minutes. If you didn't request this, you can safely ignore this email.</p>
    `)
  });
}

// ---------------- LISTING NOTIFICATIONS ----------------

// Sent to the lister right after they successfully post a food item.
async function sendListingPostedEmail(toEmail, listerName, item) {
  const details = `
    <ul style="color:#333;line-height:1.7;padding-left:20px;">
      <li><strong>Item:</strong> ${item.title}</li>
      <li><strong>Category:</strong> ${item.category === 'animals' ? 'For Animals' : 'For People'}</li>
      <li><strong>Quantity:</strong> ${item.quantity}</li>
      <li><strong>Type:</strong> ${item.listingType === 'paid' ? `Paid — ₹${item.price}/unit` : 'Free'}</li>
      <li><strong>Pincode:</strong> ${item.pincode}</li>
      <li><strong>Best before:</strong> ${item.expiry}</li>
    </ul>
  `;
  await safeSend({
    to: toEmail,
    subject: `Your listing "${item.title}" is live on FoodMitra`,
    text: `Hi ${listerName}, your food listing "${item.title}" has been posted successfully and is now visible to people nearby.`,
    html: wrapEmail(`Hi ${listerName}, your listing is live! 🎉`, `
      <p style="color:#333;">Thanks for sharing surplus food. Here's what you posted:</p>
      ${details}
      <p style="color:#666;font-size:0.9rem;">We'll email you as soon as someone places an order on it.</p>
    `)
  });
}

// ---------------- ORDER NOTIFICATIONS ----------------

function orderDetailsList(order, item) {
  return `
    <ul style="color:#333;line-height:1.7;padding-left:20px;">
      <li><strong>Item:</strong> ${order.itemTitle}</li>
      <li><strong>Quantity:</strong> ${order.quantity}</li>
      <li><strong>Type:</strong> ${order.listingType === 'paid' ? `Paid — ₹${order.price * order.quantity} total` : 'Free'}</li>
      <li><strong>Pincode:</strong> ${order.pincode}</li>
      ${item ? `<li><strong>Pickup before:</strong> ${item.expiry}</li>` : ''}
    </ul>
  `;
}

// Sent to the buyer immediately after they place an order (status: pending).
async function sendOrderPlacedEmailToBuyer(toEmail, buyerName, order, item) {
  await safeSend({
    to: toEmail,
    subject: `Order placed: ${order.itemTitle}`,
    text: `Hi ${buyerName}, your order for "${order.itemTitle}" (qty ${order.quantity}) has been placed and is pending confirmation from the lister.`,
    html: wrapEmail(`Hi ${buyerName}, your order is in! ⏳`, `
      <p style="color:#333;">Here's what you ordered. It's <strong>pending</strong> until the lister confirms it.</p>
      ${orderDetailsList(order, item)}
      <p style="color:#666;font-size:0.9rem;">We'll email you the moment it's confirmed or rejected.</p>
    `)
  });
}

// Sent to the listing owner immediately after someone orders their item.
async function sendNewOrderEmailToOwner(toEmail, ownerName, order) {
  await safeSend({
    to: toEmail,
    subject: `New order on your listing: ${order.itemTitle}`,
    text: `Hi ${ownerName}, ${order.buyerName} just ordered ${order.quantity} unit(s) of "${order.itemTitle}". Please confirm or reject it from your dashboard.`,
    html: wrapEmail(`Hi ${ownerName}, you have a new order! 📦`, `
      ${orderDetailsList(order)}
      <p style="color:#333;"><strong>Ordered by:</strong> ${order.buyerName} (${order.buyerContact})</p>
      <p style="color:#333;"><strong>Delivery/pickup address:</strong> ${order.buyerAddress}</p>
      <p style="color:#666;font-size:0.9rem;">Please log in to your dashboard to confirm or reject this order.</p>
    `)
  });
}

// Sent to the buyer when the owner confirms or rejects their order.
async function sendOrderStatusEmailToBuyer(toEmail, buyerName, order, status) {
  const isConfirmed = status === 'confirmed';
  await safeSend({
    to: toEmail,
    subject: `Order ${status}: ${order.itemTitle}`,
    text: `Hi ${buyerName}, your order for "${order.itemTitle}" has been ${status}.`,
    html: wrapEmail(
      isConfirmed ? `Hi ${buyerName}, your order is confirmed! ✅` : `Hi ${buyerName}, your order was rejected`,
      `
        ${orderDetailsList(order)}
        <p style="color:#333;">${isConfirmed
          ? 'The lister has confirmed your order — please go ahead with pickup/delivery as arranged.'
          : 'Unfortunately the lister was unable to fulfil this order. This is often because stock ran out before it could be confirmed.'}</p>
      `
    )
  });
}

// Sent to the owner as a receipt right after they confirm/reject an order.
async function sendOrderStatusEmailToOwner(toEmail, ownerName, order, status) {
  const isConfirmed = status === 'confirmed';
  await safeSend({
    to: toEmail,
    subject: `You ${status} an order: ${order.itemTitle}`,
    text: `Hi ${ownerName}, you ${status} the order from ${order.buyerName} for "${order.itemTitle}".`,
    html: wrapEmail(
      isConfirmed ? `Hi ${ownerName}, you confirmed an order ✅` : `Hi ${ownerName}, you rejected an order`,
      `
        ${orderDetailsList(order)}
        <p style="color:#333;"><strong>Buyer:</strong> ${order.buyerName} (${order.buyerContact})</p>
        <p style="color:#666;font-size:0.9rem;">This is just a receipt for your records — no action needed.</p>
      `
    )
  });
}

module.exports = {
  sendOtpEmail,
  sendListingPostedEmail,
  sendOrderPlacedEmailToBuyer,
  sendNewOrderEmailToOwner,
  sendOrderStatusEmailToBuyer,
  sendOrderStatusEmailToOwner
};
