import { DATABASE_ENGINES, dbTypeFromProtocol } from "@db-studio/shared/types";
import { Button } from "@db-studio/ui/button";
import { Input } from "@db-studio/ui/input";
import { Kbd } from "@db-studio/ui/kbd";
import { Spinner } from "@db-studio/ui/spinner";
import { cn } from "@db-studio/ui/utils";
import { useState } from "react";
import { useConnect } from "../hooks/use-connections";

/** Paste a URL, Enter connects. The URL is tested first; a failure shows under the field. */
export const ConnectUrlForm = () => {
	const [url, setUrl] = useState("");
	const { connectUrl, isConnectingUrl, urlError, clearUrlError } = useConnect();
	const engine = dbTypeFromProtocol(url.trim().split("://")[0]?.toLowerCase() ?? "");

	return (
		<form
			className="space-y-1.5"
			onSubmit={(e) => {
				e.preventDefault();
				if (url.trim()) connectUrl(url.trim());
			}}
		>
			<div className="flex h-8">
				<div className="relative h-full min-w-0 flex-1">
					<Input
						autoFocus
						variant="outline"
						value={url}
						onChange={(e) => {
							setUrl(e.target.value);
							clearUrlError();
						}}
						placeholder="postgres://user:password@localhost:5432/mydb"
						spellCheck={false}
						autoComplete="off"
						aria-label="Connection URL"
						aria-invalid={Boolean(urlError)}
						aria-describedby="connect-url-hint"
						className="h-full rounded-r-none pr-36 font-mono focus-visible:ring-inset"
					/>
					{engine && (
						<span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase text-muted-foreground">
							{DATABASE_ENGINES[engine].label}
						</span>
					)}
				</div>
				<Button
					type="submit"
					disabled={!url.trim() || isConnectingUrl}
					className="h-full w-28 rounded-l-none bg-clip-border"
				>
					{isConnectingUrl ? (
						<Spinner
							size="size-3.5"
							color="bg-primary-foreground"
						/>
					) : (
						<>
							Connect
							<Kbd className="border-0 bg-primary-foreground/15 text-primary-foreground">
								↵
							</Kbd>
						</>
					)}
				</Button>
			</div>
			<p
				id="connect-url-hint"
				role={urlError ? "alert" : undefined}
				className={cn("text-xs", urlError ? "text-destructive" : "text-muted-foreground")}
			>
				{urlError ?? "The connection is tested first. Nothing changes if it fails."}
			</p>
		</form>
	);
};
