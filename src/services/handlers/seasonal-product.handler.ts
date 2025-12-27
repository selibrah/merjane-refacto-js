import {type Product} from '@/db/schema.js';
import {type INotificationService} from '../notifications.port.js';
import {type ProductHandler} from './product-handler.interface.js';

export class SeasonalProductHandler implements ProductHandler {
	constructor(private readonly ns: INotificationService) {}

	canHandle(type: string): boolean {
		return type === 'SEASONAL';
	}

	isSellable(p: Product): boolean {
		return p.available > 0 && this.isInSeason(p);
	}

	async handleUnavailable(p: Product): Promise<void> {
		if (!this.isInSeason(p)) {
			// Before or after season → out of stock
			this.ns.sendOutOfStockNotification(p.name);
		} else if (this.canRestockBeforeSeasonEnd(p)) {
			// In season, can restock in time → delay
			this.ns.sendDelayNotification(p.leadTime, p.name);
		} else {
			// In season, but restock would arrive after season ends → out of stock
			this.ns.sendOutOfStockNotification(p.name);
		}
	}

	// Private helper: Is the product currently in season?
	private isInSeason(p: Product): boolean {
		const now = new Date();
		return p.seasonStartDate! < now && now < p.seasonEndDate!;
	}

	// Private helper: Can we restock before the season ends?
	private canRestockBeforeSeasonEnd(p: Product): boolean {
		const now = new Date();
		const msPerDay = 1000 * 60 * 60 * 24;
		const restockDate = new Date(now.getTime() + (p.leadTime * msPerDay));
		return restockDate <= p.seasonEndDate!;
	}
}
