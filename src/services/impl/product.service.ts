import {type Cradle} from '@fastify/awilix';
import {eq} from 'drizzle-orm';
import {type INotificationService} from '../notifications.port.js';
import {products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

export class ProductService {
	private readonly ns: INotificationService;
	private readonly db: Database;

	public constructor({ns, db}: Pick<Cradle, 'ns' | 'db'>) {
		this.ns = ns;
		this.db = db;
	}

	// ============================================================
	// MAIN ENTRY POINT - Called by controller
	// ============================================================
	public async processProduct(p: Product): Promise<void> {
		if (this.isSellable(p)) {
			await this.sell(p);
		} else {
			await this.handleUnavailable(p);
		}
	}

	// ============================================================
	// SELLABILITY CHECK - Per product type
	// ============================================================
	private isSellable(p: Product): boolean {
		switch (p.type) {
			case 'NORMAL': {
				return p.available > 0;
			}

			case 'SEASONAL': {
				return p.available > 0 && this.isInSeason(p);
			}

			case 'EXPIRABLE': {
				return p.available > 0 && !this.isExpired(p);
			}

			default: {
				return false;
			}
		}
	}

	// ============================================================
	// SELL - Decrement stock and persist
	// ============================================================
	private async sell(p: Product): Promise<void> {
		p.available -= 1;
		await this.db.update(products).set(p).where(eq(products.id, p.id));
	}

	// ============================================================
	// UNAVAILABLE HANDLING - Per product type
	// ============================================================
	private async handleUnavailable(p: Product): Promise<void> {
		switch (p.type) {
			case 'NORMAL': {
				await this.handleNormalUnavailable(p);
				break;
			}

			case 'SEASONAL': {
				await this.handleSeasonalUnavailable(p);
				break;
			}

			case 'EXPIRABLE': {
				await this.handleExpirableUnavailable(p);
				break;
			}
		}
	}

	// ============================================================
	// NORMAL: Unavailable handling
	// ============================================================
	private async handleNormalUnavailable(p: Product): Promise<void> {
		if (p.leadTime > 0) {
			await this.notifyDelay(p.leadTime, p);
		} else {
			this.ns.sendOutOfStockNotification(p.name);
		}
	}

	// ============================================================
	// SEASONAL: Unavailable handling
	// ============================================================
	private async handleSeasonalUnavailable(p: Product): Promise<void> {
		// Not in season OR out of stock within season
		if (!this.isInSeason(p)) {
			// Before or after season → out of stock
			this.ns.sendOutOfStockNotification(p.name);
		} else if (this.canRestockBeforeSeasonEnd(p)) {
			// In season, can restock in time → delay
			await this.notifyDelay(p.leadTime, p);
		} else {
			// In season, but restock would arrive after season ends → out of stock
			this.ns.sendOutOfStockNotification(p.name);
		}
	}

	// ============================================================
	// EXPIRABLE: Unavailable handling
	// ============================================================
	private async handleExpirableUnavailable(p: Product): Promise<void> {
		if (this.isExpired(p)) {
			// Product has expired → expiration notification
			this.ns.sendExpirationNotification(p.name, p.expiryDate!);
		} else {
			// Not expired, just out of stock → delay notification
			this.ns.sendDelayNotification(p.leadTime, p.name);
		}
	}

	// ============================================================
	// HELPER METHODS
	// ============================================================
	private isInSeason(p: Product): boolean {
		const now = new Date();
		return p.seasonStartDate! < now && now < p.seasonEndDate!;
	}

	private isExpired(p: Product): boolean {
		return p.expiryDate! <= new Date();
	}

	private canRestockBeforeSeasonEnd(p: Product): boolean {
		const now = new Date();
		const msPerDay = 1000 * 60 * 60 * 24;
		const restockDate = new Date(now.getTime() + (p.leadTime * msPerDay));
		return restockDate <= p.seasonEndDate!;
	}

	// ============================================================
	// LEGACY METHOD - Keep for backward compatibility
	// ============================================================
	public async notifyDelay(leadTime: number, p: Product): Promise<void> {
		p.leadTime = leadTime;
		await this.db.update(products).set(p).where(eq(products.id, p.id));
		this.ns.sendDelayNotification(leadTime, p.name);
	}

	// NOTE: handleSeasonalProduct and handleExpiredProduct are now replaced
	// by handleSeasonalUnavailable and handleExpirableUnavailable
	// They no longer set available = 0 (removed destructive side effect)
}
