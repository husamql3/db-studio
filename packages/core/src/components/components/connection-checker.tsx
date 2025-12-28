import { useCallback, useEffect, useRef, useState } from "react";
import { Status, StatusIndicator, StatusLabel } from "@/components/ui/status";

type ConnectionStatus = "connected" | "connecting" | "failed";

interface DBStatus {
	success: boolean;
	timestamp?: string;
	error?: string;
}

export const ConnectionChecker = () => {
	const [status, setStatus] = useState<ConnectionStatus>("connecting");
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const reconnectAttemptsRef = useRef(0);
	const connectWebSocketRef = useRef<(() => void) | null>(null);

	const MAX_RECONNECT_ATTEMPTS = 3;
	const RECONNECT_DELAY = 3000;

	const connectWebSocket = useCallback(() => {
		// Prevent multiple connection attempts
		if (
			wsRef.current?.readyState === WebSocket.CONNECTING ||
			wsRef.current?.readyState === WebSocket.OPEN
		) {
			return;
		}

		// Clean up existing connection
		if (wsRef.current) {
			wsRef.current.close();
			wsRef.current = null;
		}

		try {
			setStatus("connecting");

			const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
			const wsUrl = `${protocol}//${window.location.host}/ws`;

			const ws = new WebSocket(wsUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				setStatus("connected");
				reconnectAttemptsRef.current = 0;
			};

			ws.onmessage = (event) => {
				try {
					const data: DBStatus = JSON.parse(event.data);

					if (data.success) {
						setStatus("connected");
					} else {
						console.warn("Database check failed:", data.error);
						setStatus("failed");
					}
				} catch (err) {
					console.error("❌ Error parsing WebSocket message:", err);
					setStatus("failed");
				}
			};

			ws.onerror = () => {
				setStatus("failed");
			};

			ws.onclose = (event) => {
				console.log("🔌 WebSocket disconnected", {
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean,
				});
				setStatus("failed");
				wsRef.current = null;

				// Attempt to reconnect with exponential backoff
				if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
					reconnectAttemptsRef.current++;
					const delay = RECONNECT_DELAY * reconnectAttemptsRef.current;

					console.log(
						`🔄 Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`,
					);

					setStatus("connecting");

					reconnectTimeoutRef.current = setTimeout(() => {
						connectWebSocketRef.current?.();
					}, delay);
				} else {
					console.log("❌ Max reconnection attempts reached");
					setStatus("failed");
				}
			};
		} catch (err) {
			console.error("❌ Error creating WebSocket:", err);
			setStatus("failed");
		}
	}, []);

	// Store the function in a ref so it can be called recursively
	useEffect(() => {
		connectWebSocketRef.current = connectWebSocket;
	}, [connectWebSocket]);

	useEffect(() => {
		// Connect on mount
		connectWebSocketRef.current?.();

		// Cleanup on unmount
		return () => {
			console.log("🧹 Cleaning up WebSocket connection");
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
		};
	}, [connectWebSocket]);

	const getStatusConfig = useCallback(() => {
		switch (status) {
			case "connected":
				return { text: "connected", variant: "online" as const };
			case "connecting":
				return { text: "connecting", variant: "degraded" as const };
			case "failed":
				return { text: "failed", variant: "offline" as const };
		}
	}, [status]);

	const statusConfig = getStatusConfig();

	return (
		<Status
			className="gap-2 rounded-full px-3 py-4 text-sm absolute bottom-12 right-3"
			status={statusConfig.variant}
		>
			<StatusIndicator />
			<StatusLabel className="font-mono">{statusConfig.text}</StatusLabel>
		</Status>
	);
};
