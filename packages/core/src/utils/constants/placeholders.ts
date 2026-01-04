export const PGSQL_PLACEHOLDER_QUERY = `SELECT 
    u.id,
    u.username,
    u.email,
    COUNT(o.id) as order_count,
    SUM(o.total) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2024-01-01'
GROUP BY u.id, u.username, u.email
ORDER BY total_spent DESC
LIMIT 10;`;
