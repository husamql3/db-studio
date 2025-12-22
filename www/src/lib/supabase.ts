import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";

export const getSupabaseServerClient = (supabaseUrl: string, supabaseAnonKey: string) => {
	return createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return Object.entries(getCookies()).map(([name, value]) => ({
					name,
					value,
				}));
			},
			setAll(cookies) {
				cookies.forEach((cookie) => {
					setCookie(cookie.name, cookie.value);
				});
			},
		},
	});
};
