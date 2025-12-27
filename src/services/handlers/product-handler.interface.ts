import {type Product} from '@/db/schema.js';

export interface ProductHandler {
	canHandle(type: string): boolean;
	isSellable(p: Product): boolean;
	handleUnavailable(p: Product): Promise<void>;
}
