import {type Product} from '@/db/schema.js';
import {type INotificationService} from '../notifications.port.js';
import {type ProductHandler} from './product-handler.interface.js';

export class NormalProductHandler implements ProductHandler {
	constructor(private readonly ns: INotificationService) {}

	canHandle(type: string): boolean {
		return type === 'NORMAL';
	}

	isSellable(p: Product): boolean {
		return p.available > 0;
	}

	async handleUnavailable(p: Product): Promise<void> {
		if (p.leadTime > 0) {
			this.ns.sendDelayNotification(p.leadTime, p.name);
		} else {
			this.ns.sendOutOfStockNotification(p.name);
		}
	}
}
