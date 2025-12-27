import {
	describe, it, expect, beforeEach,
	afterEach, vi,
} from 'vitest';
import {mockDeep, type DeepMockProxy} from 'vitest-mock-extended';
import {type INotificationService} from '../notifications.port.js';
import {createDatabaseMock, cleanUp} from '../../utils/test-utils/database-tools.ts.js';
import {ProductService} from './product.service.js';
import {NormalProductHandler} from '../handlers/normal-product.handler.js';
import {SeasonalProductHandler} from '../handlers/seasonal-product.handler.js';
import {ExpirableProductHandler} from '../handlers/expirable-product.handler.js';
import {products, type Product} from '@/db/schema.js';
import {type Database} from '@/db/type.js';

describe('ProductService Tests', () => {
	let notificationServiceMock: DeepMockProxy<INotificationService>;
	let productService: ProductService;
	let databaseMock: Database;
	let databaseName: string;

	beforeEach(async () => {
		({databaseMock, databaseName} = await createDatabaseMock());
		notificationServiceMock = mockDeep<INotificationService>();

		// Create handlers with mocked NotificationService
		const handlers = [
			new NormalProductHandler(notificationServiceMock),
			new SeasonalProductHandler(notificationServiceMock),
			new ExpirableProductHandler(notificationServiceMock),
		];

		productService = new ProductService({
			ns: notificationServiceMock,
			db: databaseMock,
			handlers,
		});
	});

	afterEach(async () => cleanUp(databaseName));

	// ============================================================
	// NORMAL PRODUCT TESTS
	// ============================================================
	describe('NORMAL Products', () => {
		it('should sell when in stock (decrement available)', async () => {
			// GIVEN
			const product: Product = {
				id: 1,
				leadTime: 5,
				available: 10,
				type: 'NORMAL',
				name: 'USB Cable',
				expiryDate: null,
				seasonStartDate: null,
				seasonEndDate: null,
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			const result = await databaseMock.query.products.findFirst({
				where: (p, {eq}) => eq(p.id, product.id),
			});
			expect(result!.available).toBe(9);
			expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
			expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		});

		it('should notify delay when out of stock with leadTime > 0', async () => {
			// GIVEN
			const product: Product = {
				id: 2,
				leadTime: 7,
				available: 0,
				type: 'NORMAL',
				name: 'RJ45 Cable',
				expiryDate: null,
				seasonStartDate: null,
				seasonEndDate: null,
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(7, 'RJ45 Cable');
			expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		});

		it('should notify out of stock when out of stock with leadTime = 0', async () => {
			// GIVEN
			const product: Product = {
				id: 3,
				leadTime: 0,
				available: 0,
				type: 'NORMAL',
				name: 'Discontinued Item',
				expiryDate: null,
				seasonStartDate: null,
				seasonEndDate: null,
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Discontinued Item');
			expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		});
	});

	// ============================================================
	// SEASONAL PRODUCT TESTS
	// ============================================================
	describe('SEASONAL Products', () => {
		it('should sell when in season and in stock', async () => {
			// GIVEN - season from Dec 1 to Dec 31, current date is Dec 27
			const now = new Date();
			const product: Product = {
				id: 4,
				leadTime: 3,
				available: 50,
				type: 'SEASONAL',
				name: 'Christmas Lights',
				expiryDate: null,
				seasonStartDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
				seasonEndDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			const result = await databaseMock.query.products.findFirst({
				where: (p, {eq}) => eq(p.id, product.id),
			});
			expect(result!.available).toBe(49);
			expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		});

		it('should notify delay when in season, out of stock, and leadTime fits within season', async () => {
			// GIVEN
			const now = new Date();
			const product: Product = {
				id: 5,
				leadTime: 3,
				available: 0,
				type: 'SEASONAL',
				name: 'Christmas Lights',
				expiryDate: null,
				seasonStartDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
				seasonEndDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days from now (leadTime 3 fits)
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(3, 'Christmas Lights');
			expect(notificationServiceMock.sendOutOfStockNotification).not.toHaveBeenCalled();
		});

		it('should notify out of stock when leadTime exceeds season end', async () => {
			// GIVEN - leadTime 10 days but season ends in 3 days
			const now = new Date();
			const product: Product = {
				id: 6,
				leadTime: 10,
				available: 0,
				type: 'SEASONAL',
				name: 'Christmas Lights',
				expiryDate: null,
				seasonStartDate: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
				seasonEndDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Christmas Lights');
			expect(notificationServiceMock.sendDelayNotification).not.toHaveBeenCalled();
		});

		it('should notify out of stock when before season starts', async () => {
			// GIVEN - season starts in 10 days
			const now = new Date();
			const product: Product = {
				id: 7,
				leadTime: 3,
				available: 50,
				type: 'SEASONAL',
				name: 'Christmas Lights',
				expiryDate: null,
				seasonStartDate: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000), // starts in 10 days
				seasonEndDate: new Date(now.getTime() + 40 * 24 * 60 * 60 * 1000),
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Christmas Lights');
		});

		it('should notify out of stock when after season ends', async () => {
			// GIVEN - season ended 5 days ago
			const now = new Date();
			const product: Product = {
				id: 8,
				leadTime: 3,
				available: 50,
				type: 'SEASONAL',
				name: 'Christmas Lights',
				expiryDate: null,
				seasonStartDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
				seasonEndDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // ended 5 days ago
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			expect(notificationServiceMock.sendOutOfStockNotification).toHaveBeenCalledWith('Christmas Lights');
		});

		it('should NOT set available to 0 when notifying out of stock', async () => {
			// GIVEN - after season, but should NOT wipe inventory
			const now = new Date();
			const product: Product = {
				id: 9,
				leadTime: 3,
				available: 50,
				type: 'SEASONAL',
				name: 'Christmas Lights',
				expiryDate: null,
				seasonStartDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
				seasonEndDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN - available should still be 50, NOT 0
			const result = await databaseMock.query.products.findFirst({
				where: (p, {eq}) => eq(p.id, product.id),
			});
			expect(result!.available).toBe(50);
		});
	});

	// ============================================================
	// EXPIRABLE PRODUCT TESTS
	// ============================================================
	describe('EXPIRABLE Products', () => {
		it('should sell when in stock and not expired', async () => {
			// GIVEN
			const product: Product = {
				id: 10,
				leadTime: 5,
				available: 20,
				type: 'EXPIRABLE',
				name: 'Fresh Milk',
				expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // expires in 7 days
				seasonStartDate: null,
				seasonEndDate: null,
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			const result = await databaseMock.query.products.findFirst({
				where: (p, {eq}) => eq(p.id, product.id),
			});
			expect(result!.available).toBe(19);
			expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
		});

		it('should notify expiration when product is expired', async () => {
			// GIVEN
			const expiryDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // expired 2 days ago
			const product: Product = {
				id: 11,
				leadTime: 5,
				available: 20,
				type: 'EXPIRABLE',
				name: 'Expired Yogurt',
				expiryDate,
				seasonStartDate: null,
				seasonEndDate: null,
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN
			expect(notificationServiceMock.sendExpirationNotification).toHaveBeenCalledWith('Expired Yogurt', expiryDate);
		});

		it('should notify delay when out of stock but NOT expired', async () => {
			// GIVEN - out of stock but product is still valid
			const product: Product = {
				id: 12,
				leadTime: 5,
				available: 0,
				type: 'EXPIRABLE',
				name: 'Fresh Milk',
				expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // still valid
				seasonStartDate: null,
				seasonEndDate: null,
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN - should notify delay, NOT expiration
			expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(5, 'Fresh Milk');
			expect(notificationServiceMock.sendExpirationNotification).not.toHaveBeenCalled();
		});

		it('should NOT set available to 0 when expired', async () => {
			// GIVEN
			const expiryDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
			const product: Product = {
				id: 13,
				leadTime: 5,
				available: 20,
				type: 'EXPIRABLE',
				name: 'Expired Item',
				expiryDate,
				seasonStartDate: null,
				seasonEndDate: null,
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.processProduct(product);

			// THEN - available should still be 20, NOT 0
			const result = await databaseMock.query.products.findFirst({
				where: (p, {eq}) => eq(p.id, product.id),
			});
			expect(result!.available).toBe(20);
		});
	});

	// ============================================================
	// LEGACY TESTS (keep existing test)
	// ============================================================
	describe('Legacy: notifyDelay', () => {
		it('should handle delay notification correctly', async () => {
			// GIVEN
			const product: Product = {
				id: 100,
				leadTime: 15,
				available: 0,
				type: 'NORMAL',
				name: 'RJ45 Cable',
				expiryDate: null,
				seasonStartDate: null,
				seasonEndDate: null,
			};
			await databaseMock.insert(products).values(product);

			// WHEN
			await productService.notifyDelay(product.leadTime, product);

			// THEN
			expect(product.available).toBe(0);
			expect(product.leadTime).toBe(15);
			expect(notificationServiceMock.sendDelayNotification).toHaveBeenCalledWith(product.leadTime, product.name);
			const result = await databaseMock.query.products.findFirst({
				where: (p, {eq}) => eq(p.id, product.id),
			});
			expect(result).toEqual(product);
		});
	});
});
