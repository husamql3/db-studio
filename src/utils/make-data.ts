// import * as fs from 'node:fs';
// import * as path from 'node:path';

// // Helper to format Date to ISO string
// const toISO = (date: Date) => date.toISOString();

// // Paste your dummy data here (without exports)
// const generateDate = (year: number, month: number, day: number) => new Date(year, month - 1, day);

// const dummyUsers = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   username: `user_${i + 1}`,
//   email: `user${i + 1}@example.com`,
//   password: `hashed_password_${(i + 1) * 111}`,
//   fullName: `User ${i + 1} Name`,
//   createdAt: generateDate(2025, (i % 12) + 1, (i % 28) + 1),
//   updatedAt: generateDate(2025, (i % 12) + 1, (i % 28) + 1),
// }));

// const dummyPosts = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   title: `Post Title ${i + 1}`,
//   content: `This is the content for post number ${i + 1}. It discusses various topics including technology, health, and finance.`,
//   userId: (i % 50) + 1,
//   categoryId: (i % 3) + 1,
//   createdAt: generateDate(2025, ((i + 5) % 12) + 1, ((i + 5) % 28) + 1),
//   updatedAt: generateDate(2025, ((i + 5) % 12) + 1, ((i + 5) % 28) + 1),
// }));

// const dummyComments = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   content: ['Great post!', 'Interesting!', 'Thanks for sharing.', 'Well written.', 'I learned something new.'][i % 5],
//   userId: ((i + 1) % 50) + 1,
//   postId: (i % 50) + 1,
//   createdAt: generateDate(2025, ((i + 6) % 12) + 1, ((i + 6) % 28) + 1),
//   updatedAt: generateDate(2025, ((i + 6) % 12) + 1, ((i + 6) % 28) + 1),
// }));

// const dummyCategories = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   name: `Category ${i + 1}`,
//   description: `All posts related to category ${i + 1}.`,
//   createdAt: generateDate(2025, 1, 1),
//   updatedAt: generateDate(2025, 1, 1),
// }));

// const dummyTags = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   name: `tag_${i + 1}`,
//   createdAt: generateDate(2025, 1, 1),
//   updatedAt: generateDate(2025, 1, 1),
// }));

// const dummyMedia = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   url: `https://example.com/media${i + 1}.${i % 2 === 0 ? 'jpg' : 'mp4'}`,
//   type: i % 2 === 0 ? 'image' : 'video',
//   postId: (i % 50) + 1,
//   createdAt: generateDate(2025, ((i + 5) % 12) + 1, ((i + 5) % 28) + 1),
//   updatedAt: generateDate(2025, ((i + 5) % 12) + 1, ((i + 5) % 28) + 1),
// }));

// const dummyPages = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   title: `Page ${i + 1}`,
//   content: `Content for page ${i + 1}. This is a static page.`,
//   slug: `page-${i + 1}`,
//   createdAt: generateDate(2025, 1, 1),
//   updatedAt: generateDate(2025, 1, 1),
// }));

// const dummyOrders = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   userId: (i % 50) + 1,
//   productId: (i % 50) + 1,
//   quantity: (i % 5) + 1,
//   total: ((i % 10) + 1) * 25.0,
//   status: ['completed', 'pending', 'shipped', 'cancelled'][i % 4],
//   createdAt: generateDate(2025, ((i + 10) % 12) + 1, ((i + 10) % 28) + 1),
//   updatedAt: generateDate(2025, ((i + 10) % 12) + 1, ((i + 10) % 28) + 1),
// }));

// const dummyProducts = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   name: `Product ${i + 1}`,
//   description: `Description of Product ${i + 1}. High quality item.`,
//   price: ((i % 20) + 1) * 5.0,
//   stock: ((i * 17) % 200) + 10,
//   createdAt: generateDate(2025, 1, 1),
//   updatedAt: generateDate(2025, 1, 1),
// }));

// const dummyInvoices = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   orderId: i + 1,
//   amount: ((i % 10) + 1) * 25.0,
//   status: ['paid', 'unpaid', 'refunded'][i % 3],
//   createdAt: generateDate(2025, ((i + 11) % 12) + 1, ((i + 11) % 28) + 1),
//   updatedAt: generateDate(2025, ((i + 11) % 12) + 1, ((i + 11) % 28) + 1),
// }));

// const dummyProfiles = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   userId: i + 1,
//   bio: `Bio of User ${i + 1}. Passionate about learning and growth.`,
//   avatar: `https://example.com/avatar${i + 1}.jpg`,
//   createdAt: generateDate(2025, 1, 1),
//   updatedAt: generateDate(2025, 1, 1),
// }));

// const dummyMessages = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   senderId: ((i % 49) + 1),
//   receiverId: (((i + 1) % 49) + 1),
//   content: `Message content ${i + 1}. Let's connect!`,
//   createdAt: generateDate(2025, ((i + 15) % 12) + 1, ((i + 15) % 28) + 1),
//   updatedAt: generateDate(2025, ((i + 15) % 12) + 1, ((i + 15) % 28) + 1),
// }));

// const dummyNotifications = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   userId: (i % 50) + 1,
//   message: ['New comment', 'Order update', 'New message', 'Profile view'][i % 4],
//   read: i % 3 === 0,
//   createdAt: generateDate(2025, ((i + 6) % 12) + 1, ((i + 6) % 28) + 1),
//   updatedAt: generateDate(2025, ((i + 6) % 12) + 1, ((i + 6) % 28) + 1),
// }));

// const dummySettings = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   key: `setting_key_${i + 1}`,
//   value: i % 2 === 0 ? 'enabled' : 'disabled',
//   createdAt: generateDate(2025, 1, 1),
//   updatedAt: generateDate(2025, 1, 1),
// }));

// const dummyAuditLogs = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   action: ['user_login', 'post_created', 'order_placed', 'profile_updated'][i % 4],
//   userId: (i % 50) + 1,
//   details: `Action performed by User ${i + 1}.`,
//   createdAt: new Date(`2025-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}T${String((i % 24)).padStart(2, '0')}:00:00`),
// }));

// const dummySessions = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   userId: i + 1,
//   token: `session_token_${(i + 1) * 1000}`,
//   expiresAt: generateDate(2025, ((i % 12) + 2), 1),
//   createdAt: generateDate(2025, (i % 12) + 1, 1),
//   updatedAt: generateDate(2025, (i % 12) + 1, 1),
// }));

// const dummyAttachments = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   fileName: `file${i + 1}.${['pdf', 'jpg', 'png', 'docx'][i % 4]}`,
//   url: `https://example.com/attachment${i + 1}`,
//   messageId: (i % 50) + 1,
//   createdAt: generateDate(2025, ((i + 15) % 12) + 1, ((i + 15) % 28) + 1),
//   updatedAt: generateDate(2025, ((i + 15) % 12) + 1, ((i + 15) % 28) + 1),
// }));

// const dummyTeams = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   name: `Team ${i + 1}`,
//   description: `Description for Team ${i + 1}.`,
//   createdAt: generateDate(2025, 1, 1),
//   updatedAt: generateDate(2025, 1, 1),
// }));

// const dummyProjects = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   name: `Project ${i + 1}`,
//   description: `Description of Project ${i + 1}.`,
//   teamId: (i % 50) + 1,
//   status: ['in_progress', 'planning', 'completed', 'on_hold'][i % 4],
//   createdAt: generateDate(2025, 1, 1),
//   updatedAt: generateDate(2025, 1, 1),
// }));

// const dummySubscriptions = Array.from({ length: 100 }, (_, i) => ({
//   id: i + 1,
//   userId: i + 1,
//   plan: ['basic', 'premium', 'enterprise'][i % 3],
//   startDate: generateDate(2025, (i % 12) + 1, 1),
//   endDate: generateDate(2025, (i % 12) + 1, 28),
//   status: ['active', 'cancelled', 'paused'][i % 3],
//   createdAt: generateDate(2025, (i % 12) + 1, 1),
//   updatedAt: generateDate(2025, (i % 12) + 1, 1),
// }));

// // Map of name -> data
// const dummyDataMap: Record<string, unknown[]> = {
//   users: dummyUsers,
//   posts: dummyPosts,
//   comments: dummyComments,
//   categories: dummyCategories,
//   tags: dummyTags,
//   media: dummyMedia,
//   pages: dummyPages,
//   orders: dummyOrders,
//   products: dummyProducts,
//   invoices: dummyInvoices,
//   profiles: dummyProfiles,
//   messages: dummyMessages,
//   notifications: dummyNotifications,
//   settings: dummySettings,
//   audit_logs: dummyAuditLogs,
//   sessions: dummySessions,
//   attachments: dummyAttachments,
//   teams: dummyTeams,
//   projects: dummyProjects,
//   subscriptions: dummySubscriptions,
// };

// // Output directory
// const outputDir = path.join(import.meta.url, 'dummy-data');
// if (!fs.existsSync(outputDir)) {
//   fs.mkdirSync(outputDir, { recursive: true });
// }

// // Serialize each dataset to JSON
// Object.entries(dummyDataMap).forEach(([name, data]) => {
//   const formattedData = data.map(item => {
//     const obj: Record<string, unknown> = {};
//     for (const [key, value] of Object.entries(item)) {
//       obj[key] = value instanceof Date ? toISO(value) : value;
//     }
//     return obj;
//   });

//   const filePath = path.join(outputDir, `${name}.json`);
//   fs.writeFileSync(filePath, JSON.stringify(formattedData, null, 2), 'utf-8');
//   console.log(`Generated: ${filePath}`);
// });

// console.log('All dummy JSON files generated in ./dummy-data/');
