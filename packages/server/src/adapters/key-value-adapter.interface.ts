import type {
	CreateKeySchemaType,
	DeleteKeyQuerySchemaType,
	DeleteKeyResultSchemaType,
	KeyActionSchemaType,
	KeyDetailsQuerySchemaType,
	KeyDetailsResultSchemaType,
	KeyRawQuerySchemaType,
	KeyRawResultSchemaType,
	KeyScanQuerySchemaType,
	KeyScanResultSchemaType,
	KeyWriteResultSchemaType,
} from "@db-studio/shared/types";

export interface IKeyValueAdapter {
	scanKeys(params: KeyScanQuerySchemaType): Promise<KeyScanResultSchemaType>;
	getKeyDetails(
		params: KeyDetailsQuerySchemaType & { key: string },
	): Promise<KeyDetailsResultSchemaType>;
	getStringChunk(
		params: KeyRawQuerySchemaType & { key: string },
	): Promise<KeyRawResultSchemaType>;
	createKey(params: CreateKeySchemaType & { db: string }): Promise<KeyWriteResultSchemaType>;
	applyKeyAction(
		params: KeyActionSchemaType & { db: string; key: string },
	): Promise<KeyWriteResultSchemaType>;
	deleteKey(
		params: DeleteKeyQuerySchemaType & { key: string },
	): Promise<DeleteKeyResultSchemaType>;
}
