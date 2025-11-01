// Helper function to generate dates
const generateDate = (year: number, month: number, day: number) => new Date(year, month - 1, day);

// ========================================
// dummyUsers - 50 users
// ========================================
export const dummyUsers = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	username: `user_${i + 1}`,
	email: `user${i + 1}@example.com`,
	password: `hashed_password_${(i + 1) * 111}`,
	fullName: `User ${i + 1} Name`,
	createdAt: generateDate(2025, (i % 12) + 1, (i % 28) + 1),
	updatedAt: generateDate(2025, (i % 12) + 1, (i % 28) + 1),
}));

// ========================================
// dummyPosts - 50 posts
// ========================================
export const dummyPosts = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	title: `Post Title ${i + 1}`,
	content: `This is the content for post number ${i + 1}. It discusses various topics including technology, health, and finance.`,
	userId: (i % 50) + 1,
	categoryId: (i % 3) + 1,
	createdAt: generateDate(2025, ((i + 5) % 12) + 1, ((i + 5) % 28) + 1),
	updatedAt: generateDate(2025, ((i + 5) % 12) + 1, ((i + 5) % 28) + 1),
}));

// ========================================
// dummyComments - 50 comments
// ========================================
export const dummyComments = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	content: ["Great post!", "Interesting!", "Thanks for sharing.", "Well written.", "I learned something new."][i % 5],
	userId: ((i + 1) % 50) + 1,
	postId: (i % 50) + 1,
	createdAt: generateDate(2025, ((i + 6) % 12) + 1, ((i + 6) % 28) + 1),
	updatedAt: generateDate(2025, ((i + 6) % 12) + 1, ((i + 6) % 28) + 1),
}));

// ========================================
// dummyCategories - 50 categories
// ========================================
export const dummyCategories = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	name: `Category ${i + 1}`,
	description: `All posts related to category ${i + 1}.`,
	createdAt: generateDate(2025, 1, 1),
	updatedAt: generateDate(2025, 1, 1),
}));

// ========================================
// dummyTags - 50 tags
// ========================================
export const dummyTags = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	name: `tag_${i + 1}`,
	createdAt: generateDate(2025, 1, 1),
	updatedAt: generateDate(2025, 1, 1),
}));

// ========================================
// dummyMedia - 50 media items
// ========================================
export const dummyMedia = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	url: `https://example.com/media${i + 1}.${i % 2 === 0 ? "jpg" : "mp4"}`,
	type: i % 2 === 0 ? "image" : "video",
	postId: (i % 50) + 1,
	createdAt: generateDate(2025, ((i + 5) % 12) + 1, ((i + 5) % 28) + 1),
	updatedAt: generateDate(2025, ((i + 5) % 12) + 1, ((i + 5) % 28) + 1),
}));

// ========================================
// dummyPages - 50 pages
// ========================================
export const dummyPages = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	title: `Page ${i + 1}`,
	content: `Content for page ${i + 1}. This is a static page.`,
	slug: `page-${i + 1}`,
	createdAt: generateDate(2025, 1, 1),
	updatedAt: generateDate(2025, 1, 1),
}));

// ========================================
// dummyOrders - 50 orders
// ========================================
export const dummyOrders = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	userId: (i % 50) + 1,
	productId: (i % 50) + 1,
	quantity: (i % 5) + 1,
	total: ((i % 10) + 1) * 25.0,
	status: ["completed", "pending", "shipped", "cancelled"][i % 4],
	createdAt: generateDate(2025, ((i + 10) % 12) + 1, ((i + 10) % 28) + 1),
	updatedAt: generateDate(2025, ((i + 10) % 12) + 1, ((i + 10) % 28) + 1),
}));

// ========================================
// dummyProducts - 50 products
// ========================================
export const dummyProducts = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	name: `Product ${i + 1}`,
	description: `Description of Product ${i + 1}. High quality item.`,
	price: ((i % 20) + 1) * 5.0,
	stock: ((i * 17) % 200) + 10,
	createdAt: generateDate(2025, 1, 1),
	updatedAt: generateDate(2025, 1, 1),
}));

// ========================================
// dummyInvoices - 50 invoices
// ========================================
export const dummyInvoices = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	orderId: i + 1,
	amount: ((i % 10) + 1) * 25.0,
	status: ["paid", "unpaid", "refunded"][i % 3],
	createdAt: generateDate(2025, ((i + 11) % 12) + 1, ((i + 11) % 28) + 1),
	updatedAt: generateDate(2025, ((i + 11) % 12) + 1, ((i + 11) % 28) + 1),
}));

// ========================================
// dummyProfiles - 50 profiles
// ========================================
export const dummyProfiles = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	userId: i + 1,
	bio: `Bio of User ${i + 1}. Passionate about learning and growth.`,
	avatar: `https://example.com/avatar${i + 1}.jpg`,
	createdAt: generateDate(2025, 1, 1),
	updatedAt: generateDate(2025, 1, 1),
}));

// ========================================
// dummyMessages - 50 messages
// ========================================
export const dummyMessages = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	senderId: (i % 49) + 1,
	receiverId: ((i + 1) % 49) + 1,
	content: `Message content ${i + 1}. Let's connect!`,
	createdAt: generateDate(2025, ((i + 15) % 12) + 1, ((i + 15) % 28) + 1),
	updatedAt: generateDate(2025, ((i + 15) % 12) + 1, ((i + 15) % 28) + 1),
}));

// ========================================
// dummyNotifications - 50 notifications
// ========================================
export const dummyNotifications = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	userId: (i % 50) + 1,
	message: ["New comment", "Order update", "New message", "Profile view"][i % 4],
	read: i % 3 === 0,
	createdAt: generateDate(2025, ((i + 6) % 12) + 1, ((i + 6) % 28) + 1),
	updatedAt: generateDate(2025, ((i + 6) % 12) + 1, ((i + 6) % 28) + 1),
}));

// ========================================
// dummySettings - 50 settings
// ========================================
export const dummySettings = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	key: `setting_key_${i + 1}`,
	value: i % 2 === 0 ? "enabled" : "disabled",
	createdAt: generateDate(2025, 1, 1),
	updatedAt: generateDate(2025, 1, 1),
}));

// ========================================
// dummyAuditLogs - 50 audit logs
// ========================================
export const dummyAuditLogs = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	action: ["user_login", "post_created", "order_placed", "profile_updated"][i % 4],
	userId: (i % 50) + 1,
	details: `Action performed by User ${i + 1}.`,
	createdAt: new Date(
		`2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}T${String(i % 24).padStart(2, "0")}:00:00`,
	),
}));

// ========================================
// dummySessions - 50 sessions
// ========================================
export const dummySessions = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	userId: i + 1,
	token: `session_token_${(i + 1) * 1000}`,
	expiresAt: generateDate(2025, (i % 12) + 2, 1),
	createdAt: generateDate(2025, (i % 12) + 1, 1),
	updatedAt: generateDate(2025, (i % 12) + 1, 1),
}));

// ========================================
// dummyAttachments - 50 attachments
// ========================================
export const dummyAttachments = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	fileName: `file${i + 1}.${["pdf", "jpg", "png", "docx"][i % 4]}`,
	url: `https://example.com/attachment${i + 1}`,
	messageId: (i % 50) + 1,
	createdAt: generateDate(2025, ((i + 15) % 12) + 1, ((i + 15) % 28) + 1),
	updatedAt: generateDate(2025, ((i + 15) % 12) + 1, ((i + 15) % 28) + 1),
}));

// ========================================
// dummyTeams - 50 teams
// ========================================
export const dummyTeams = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	name: `Team ${i + 1}`,
	description: `Description for Team ${i + 1}.`,
	createdAt: generateDate(2025, 1, 1),
	updatedAt: generateDate(2025, 1, 1),
}));

// ========================================
// dummyProjects - 50 projects
// ========================================
export const dummyProjects = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	name: `Project ${i + 1}`,
	description: `Description of Project ${i + 1}.`,
	teamId: (i % 50) + 1,
	status: ["in_progress", "planning", "completed", "on_hold"][i % 4],
	createdAt: generateDate(2025, 1, 1),
	updatedAt: generateDate(2025, 1, 1),
}));

// ========================================
// dummySubscriptions - 50 subscriptions
// ========================================
export const dummySubscriptions = Array.from({ length: 100 }, (_, i) => ({
	id: i + 1,
	userId: i + 1,
	plan: ["basic", "premium", "enterprise"][i % 3],
	startDate: generateDate(2025, (i % 12) + 1, 1),
	endDate: generateDate(2025, (i % 12) + 1, 28),
	status: ["active", "cancelled", "paused"][i % 3],
	createdAt: generateDate(2025, (i % 12) + 1, 1),
	updatedAt: generateDate(2025, (i % 12) + 1, 1),
}));

export const dummyTables = [
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
	"subscriptions",
];
