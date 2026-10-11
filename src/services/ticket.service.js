const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { Booking, Show } = require('../models');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { validSignature } = require('./razorpay.service');
const bookingService = require('./booking.service');

function tokenFor(booking) {
  const content = `GS1.${booking._id}.${booking.ticketNonce}`;
  return `${content}.${crypto.createHmac('sha256', env.JWT_SECRET).update(content).digest('hex')}`;
}
async function ticket(id, actor) {
  const booking = await bookingService.getById(id, actor);
  if (booking.status !== 'CONFIRMED' || booking.paymentStatus !== 'PAID') throw ApiError.conflict('Tickets are available only for confirmed, paid bookings');
  const privateBooking = await Booking.findById(id).select('+ticketNonce');
  if (!privateBooking.ticketNonce) throw ApiError.conflict('This legacy booking has no verified payment ticket');
  const token = tokenFor(privateBooking);
  const scanUrl = `${env.PUBLIC_APP_URL}/admin/check-in?ticket=${encodeURIComponent(token)}`;
  const qrDataUrl = await QRCode.toDataURL(scanUrl, { errorCorrectionLevel: 'M', width: 480, margin: 4 });
  return { booking, qrDataUrl, scanUrl, token };
}
async function validateToken(input) {
  let token = input.trim();
  if (/^https?:\/\//.test(token)) {
    try { token = new URL(token).searchParams.get('ticket') || ''; } catch { throw ApiError.badRequest('Invalid ticket URL'); }
  }
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'GS1' || !/^[a-f0-9]{24}$/.test(parts[1]) || !validSignature(parts.slice(0, 3).join('.'), parts[3], env.JWT_SECRET)) throw ApiError.badRequest('Invalid ticket signature');
  const booking = await Booking.findById(parts[1]).select('+ticketNonce').populate({ path: 'show', populate: ['movie', 'theatre', 'screen'] });
  if (!booking || booking.ticketNonce !== parts[2]) throw ApiError.notFound('Ticket not found');
  if (booking.status !== 'CONFIRMED' || booking.paymentStatus !== 'PAID' || booking.show?.status !== 'SCHEDULED') throw ApiError.conflict('This ticket has been cancelled or is not paid');
  if (booking.show.endTime <= new Date()) throw ApiError.conflict('This ticket has expired');
  const data = booking.toObject();
  delete data.ticketNonce;
  return data;
}
async function checkIn(token, actor) {
  const validated = await validateToken(token);
  await withTransaction(async session => {
    const show = await Show.findOneAndUpdate({ _id: validated.show._id, status: 'SCHEDULED', endTime: { $gt: new Date() } }, { $inc: { bookingVersion: 1 } }, { session });
    if (!show) throw ApiError.conflict('This show is cancelled or has ended');
    if (show.startTime.getTime() - Date.now() > 2 * 60 * 60000) throw ApiError.badRequest('Check-in opens two hours before the show');
    const updated = await Booking.findOneAndUpdate({ _id: validated._id, status: 'CONFIRMED', paymentStatus: 'PAID', checkedInAt: null }, { $set: { checkedInAt: new Date(), checkedInBy: actor._id } }, { session, new: true });
    if (!updated) throw ApiError.conflict('Ticket already checked in or no longer valid');
  });
  return validateToken(token);
}
async function pdf(id, actor) {
  const { booking, qrDataUrl } = await ticket(id, actor);
  const doc = new PDFDocument({ size: 'A5', margin: 32 });
  const chunks = [];
  const complete = new Promise((resolve, reject) => { doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });
  doc.fillColor('#b84b34').fontSize(11).text('GOODSHOW / TEST MODE TICKET');
  doc.moveDown().fillColor('#26231f').fontSize(21).text(booking.show.movie.title);
  doc.moveDown(0.5).fontSize(10).text(booking.bookingReference);
  doc.moveDown().fontSize(12).text(`${booking.show.theatre.name} - ${booking.show.screen.name}`);
  doc.fontSize(10).text(booking.show.theatre.address.city);
  doc.moveDown().text(new Date(booking.show.startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' }) + ' IST');
  doc.text(`${booking.show.language} / ${booking.show.format}`);
  doc.moveDown().fontSize(12).text(`Seats: ${booking.seatDetails.map(s => s.label).join(', ')}`);
  doc.fontSize(10).text(`Paid: INR ${booking.totalAmount.toFixed(2)} (test payment)`);
  doc.text(`Payment: ${booking.paymentId}`);
  doc.moveDown().image(Buffer.from(qrDataUrl.split(',')[1], 'base64'), { width: 165, align: 'center' });
  doc.moveDown().fontSize(9).text('Show this QR code at entry. One check-in covers every seat on this ticket. Test mode: no real money was charged.', { align: 'center' });
  doc.end();
  return { buffer: await complete, filename: `${booking.bookingReference}.pdf` };
}
module.exports = { ticket, pdf, validateToken, checkIn };
