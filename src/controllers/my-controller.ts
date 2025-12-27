/* eslint-disable no-await-in-loop */
import {eq} from 'drizzle-orm';
import fastifyPlugin from 'fastify-plugin';
import {serializerCompiler, validatorCompiler, type ZodTypeProvider} from 'fastify-type-provider-zod';
import {z} from 'zod';
import {orders} from '@/db/schema.js';

export const myController = fastifyPlugin(async server => {
	// Add schema validator and serializer
	server.setValidatorCompiler(validatorCompiler);
	server.setSerializerCompiler(serializerCompiler);

	server.withTypeProvider<ZodTypeProvider>().post('/orders/:orderId/processOrder', {
		schema: {
			params: z.object({
				orderId: z.coerce.number(),
			}),
		},
	}, async (request, reply) => {
		const db = server.diContainer.resolve('db');
		const ps = server.diContainer.resolve('ps');

		const order = (await db.query.orders
			.findFirst({
				where: eq(orders.id, request.params.orderId),
				with: {
					products: {
						columns: {},
						with: {
							product: true,
						},
					},
				},
			}))!;

		console.log(order);

		const {products: productList} = order;

		if (productList) {
			for (const {product} of productList) {
				// All business logic now lives in ProductService
				await ps.processProduct(product);
			}
		}

		await reply.send({orderId: order.id});
	});
});
