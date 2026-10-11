function send(res, status, message, data, meta) {
  const body = { success: true, message };
  if (data !== undefined) body.data = data;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

const ok = (res, data, message = 'Success', meta) => send(res, 200, message, data, meta);
const created = (res, data, message = 'Created successfully') => send(res, 201, message, data);

module.exports = { ok, created };
