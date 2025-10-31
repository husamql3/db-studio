export const getTables = async (): Promise<string[]> => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return [
    "users",
    "posts",
    "comments",
    "categories",
    "tags",
    "media",
    "pages",
    "orders",
    "products",
    "invoices",
    "profiles",
    "messages",
    "notifications",
    "settings",
    "audit_logs",
    "sessions",
    "attachments",
    "teams",
    "projects",
    "subscriptions"
  ];
}