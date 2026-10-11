const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive exact match condition that is safe against regex injection. */
const exactInsensitive = (value) => ({ $regex: `^${escapeRegex(value)}$`, $options: 'i' });

function parsePagination({ page = 1, limit = 20 } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(500, Math.max(1, parseInt(limit, 10) || 20));
  return { page: p, limit: l, skip: (p - 1) * l };
}

const paginationMeta = (total, page, limit) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 0,
});

module.exports = { escapeRegex, exactInsensitive, parsePagination, paginationMeta };
