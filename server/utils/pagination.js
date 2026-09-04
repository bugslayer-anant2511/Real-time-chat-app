export const parsePagination = (
  query = {},
  { defaultLimit = 20, maxLimit = 50 } = {},
) => {
  const rawPage = Number.parseInt(query.page, 10);
  const rawLimit = Number.parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, maxLimit)
      : defaultLimit;

  return { page, limit, skip: (page - 1) * limit };
};

export const buildPageMeta = ({ total, page, limit }) => ({
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil((total || 0) / Math.max(1, limit))),
});
