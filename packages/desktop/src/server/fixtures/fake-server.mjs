import { createServer } from "node:http";

createServer((request, response) => {
	response.writeHead(request.url === "/api/databases" ? 200 : 404).end();
}).listen(Number(process.env.PORT), process.env.HOST);
