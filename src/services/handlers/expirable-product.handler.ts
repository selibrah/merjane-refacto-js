import {type Product} from '@/db/schema.js';
import {type INotificationService} from '../notifications.port.js';
import {type ProductHandler} from './product-handler.interface.js';

export class ExpirableProductHandler implements ProductHandler {
	constructor(private readonly ns: INotificationService) {}

	canHandle(type: string): boolean {
		return type === 'EXPIRABLE';
	}

	isSellable(p: Product): boolean {
		return p.available > 0 && !this.isExpired(p);
	}

	async handleUnavailable(p: Product): Promise<void> {
		if (this.isExpired(p)) {
			// Product has expired → expiration notification
			this.ns.sendExpirationNotification(p.name, p.expiryDate!);
		} else {
			// Not expired, just out of stock → delay notification
			this.ns.sendDelayNotification(p.leadTime, p.name);
		}
	}

	// Private helper: Is the product expired?
	private isExpired(p: Product): boolean {
		return p.expiryDate! <= new Date();
	}
}
