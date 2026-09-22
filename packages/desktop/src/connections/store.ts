import { randomUUID } from "node:crypto";
import {
	type SaveConnectionInputSchemaType,
	type SavedConnectionSchemaType,
	saveConnectionInputSchema,
} from "@db-studio/shared/types";
import { type Rectangle, safeStorage } from "electron";
import Store from "electron-store";
import { describeConnectionUrl } from "./describe-url";

type StoredConnection = SavedConnectionSchemaType & { encryptedUrl: string };

type StoreSchema = {
	connections: StoredConnection[];
	windowBounds?: Rectangle;
};

const toPublic = ({ encryptedUrl: _encryptedUrl, ...connection }: StoredConnection) =>
	connection;

/**
 * Saved connections. Metadata is plain JSON in userData; the URL (which carries the
 * password) is encrypted with the OS keychain-backed `safeStorage` and never returned to
 * the renderer.
 */
export class ConnectionStore {
	private readonly store = new Store<StoreSchema>({
		name: "connections",
		defaults: { connections: [] },
	});

	list(): SavedConnectionSchemaType[] {
		return this.store
			.get("connections")
			.map(toPublic)
			.sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
	}

	save(rawInput: SaveConnectionInputSchemaType): SavedConnectionSchemaType {
		const input = saveConnectionInputSchema.parse(rawInput);
		if (!safeStorage.isEncryptionAvailable()) {
			throw new Error("Secure storage is not available on this device");
		}
		const { dbType, summary } = describeConnectionUrl(input.url);
		const encryptedUrl = safeStorage.encryptString(input.url.trim()).toString("base64");

		const connections = this.store.get("connections");
		const existing = input.id ? connections.find((c) => c.id === input.id) : undefined;
		const saved: StoredConnection = {
			id: existing?.id ?? randomUUID(),
			name: input.name.trim(),
			color: input.color,
			dbType,
			summary,
			createdAt: existing?.createdAt ?? new Date().toISOString(),
			lastUsedAt: existing?.lastUsedAt,
			encryptedUrl,
		};
		this.store.set(
			"connections",
			existing
				? connections.map((c) => (c.id === saved.id ? saved : c))
				: [...connections, saved],
		);
		return toPublic(saved);
	}

	delete(id: string): void {
		this.store.set(
			"connections",
			this.store.get("connections").filter((c) => c.id !== id),
		);
	}

	getUrl(id: string): string | null {
		const connection = this.store.get("connections").find((c) => c.id === id);
		if (!connection) return null;
		return safeStorage.decryptString(Buffer.from(connection.encryptedUrl, "base64"));
	}

	touch(id: string): void {
		const now = new Date().toISOString();
		this.store.set(
			"connections",
			this.store.get("connections").map((c) => (c.id === id ? { ...c, lastUsedAt: now } : c)),
		);
	}

	getWindowBounds(): Rectangle | undefined {
		return this.store.get("windowBounds");
	}

	setWindowBounds(bounds: Rectangle): void {
		this.store.set("windowBounds", bounds);
	}
}
