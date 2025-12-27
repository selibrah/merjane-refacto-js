import {type Cradle, diContainer} from '@fastify/awilix';
import {asClass, asValue} from 'awilix';
import {type FastifyBaseLogger, type FastifyInstance} from 'fastify';
import {type INotificationService} from '@/services/notifications.port.js';
import {NotificationService} from '@/services/impl/notification.service.js';
import {type Database} from '@/db/type.js';
import {ProductService} from '@/services/impl/product.service.js';
import {NormalProductHandler} from '@/services/handlers/normal-product.handler.js';
import {SeasonalProductHandler} from '@/services/handlers/seasonal-product.handler.js';
import {ExpirableProductHandler} from '@/services/handlers/expirable-product.handler.js';

declare module '@fastify/awilix' {

	interface Cradle { // eslint-disable-line @typescript-eslint/consistent-type-definitions
		logger: FastifyBaseLogger;
		db: Database;
		ns: INotificationService;
		ps: ProductService;
	}
}

export async function configureDiContext(
	server: FastifyInstance,
): Promise<void> {
	diContainer.register({
		logger: asValue(server.log),
	});
	diContainer.register({
		db: asValue(server.database),
	});
	diContainer.register({
		ns: asClass(NotificationService),
	});

	// Create handlers with NotificationService dependency
	const ns = diContainer.resolve<INotificationService>('ns');
	const handlers = [
		new NormalProductHandler(ns),
		new SeasonalProductHandler(ns),
		new ExpirableProductHandler(ns),
	];

	diContainer.register({
		ps: asValue(new ProductService({
			ns,
			db: server.database,
			handlers,
		})),
	});
}

export function resolve<Service extends keyof Cradle>(
	service: Service,
): Cradle[Service] {
	return diContainer.resolve(service);
}
