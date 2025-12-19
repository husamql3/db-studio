import serverEntrypoint from "../../../dist/server/index.js";

if (typeof serverEntrypoint?.fetch !== "function") {
console.error("The server entry point must have a default export with a property `fetch: (req: Request) => Promise<Response>`");
}

export default serverEntrypoint.fetch;

export const config = {
name: "@netlify/vite-plugin server handler",
generator: "@netlify/vite-plugin@2.7.18",
path: "/*",
preferStatic: true,
};