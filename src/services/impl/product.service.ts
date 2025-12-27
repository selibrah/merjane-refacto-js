import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {type INotificationService} from '../notifications.port.js';
import {type ProductHandler} from '../handlers/product-handler.interface.js';
import {products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

export class ProductService {
	private readonly ns: INotificationService;
	private readonly db: Database;
	private readonly handlers: ProductHandler[];

	public constructor({ns, db, handlers}: Pick<Cradle, 'ns' | 'db'> & {handlers: ProductHandler[]}) {
		this.ns = ns;
		this.db = db;
		this.handlers = handlers;
	}

	// ============================================================
	// MAIN ENTRY POINT - Uses Strategy Pattern
	// ============================================================
	public async processProduct(p: Product): Promise<void> {
		const handler = this.getHandler(p);
		if (handler.isSellable(p)) {
			await this.sell(p);
		} else {
			await handler.handleUnavailable(p);
		}
	}

	// ============================================================
	// FIND HANDLER - Registry lookup
	// ============================================================
	private getHandler(p: Product): ProductHandler {
		const handler = this.handlers.find(h => h.canHandle(p.type));
		if (!handler) {
			throw new Error(`No handler found for product type: ${p.type}`);
		}

		return handler;
	}

	// ============================================================
	// SELL - Decrement stock and persist (stays in ProductService)
	// ============================================================
	private async sell(p: Product): Promise<void> {
		p.available -= 1;
		await this.db.update(products).set(p).where(eq(products.id, p.id));
	}

	// ============================================================
	// LEGACY METHOD - Keep for backward compatibility
	// ============================================================
	public async notifyDelay(leadTime: number, p: Product): Promise<void> {
		p.leadTime = leadTime;
		await this.db.update(products).set(p).where(eq(products.id, p.id));
		this.ns.sendDelayNotification(leadTime, p.name);
	}
}
