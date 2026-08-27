import handler from "@tanstack/react-start/server-entry";

const CANONICAL_HOST = "dbstudio.sh";

export default {
	fetch(request) {
		const url = new URL(request.url);

		// 301 www (and any other non-canonical host alias) to the apex domain
		if (url.hostname !== CANONICAL_HOST && url.hostname.endsWith(`.${CANONICAL_HOST}`)) {
			url.hostname = CANONICAL_HOST;
			return Response.redirect(url.toString(), 301);
		}

		return handler.fetch(request);
	},
} satisfies ExportedHandler<Env>;
