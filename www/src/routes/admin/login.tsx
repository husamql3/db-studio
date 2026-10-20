import { createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// src/admin-auth.ts checks the posted password and sets the session cookie.
export const Route = createFileRoute("/admin/login")({
	component: Login,
	validateSearch: (search): { error?: boolean } => (search.error ? { error: true } : {}),
	head: () => ({
		meta: [{ title: "Sign in · db-studio admin" }, { name: "robots", content: "noindex" }],
	}),
});

function Login() {
	const { error } = Route.useSearch();

	return (
		<main className="flex min-h-dvh items-center justify-center px-4">
			<form
				method="post"
				action="/admin/login"
				className="flex w-full max-w-xs flex-col gap-3 border p-5"
			>
				<h1 className="font-semibold text-sm">db-studio admin</h1>
				<label className="flex flex-col gap-1 text-xs">
					Password
					<input
						name="password"
						type="password"
						required
						autoComplete="current-password"
						className="h-8 w-full border bg-background px-2 text-sm outline-none focus:border-foreground/40"
					/>
				</label>
				{error && <p className="text-red-400 text-xs">Wrong password. Try again.</p>}
				<button
					type="submit"
					className={cn(buttonVariants({ variant: "primary", size: "sm" }), "w-full")}
				>
					Sign in
				</button>
			</form>
		</main>
	);
}
