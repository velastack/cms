import { describe, expect, it } from 'vitest';
import { fillMessage, orderPlaceholders, type Order } from '@velastack/whatsapp';
import { DEFAULT_ORDER_MESSAGE, tidyMessage } from './order-message.js';

const order: Order = {
	ref: 'A7K-3Q2',
	name: 'Ada',
	phone: '+44 20 7946 0000',
	currency: 'EUR',
	lines: [
		{ name: 'Sourdough', quantity: 2, price: 4.5 },
		{ name: 'Rye', quantity: 1, price: 5 }
	],
	subtotal: 14
};

const message = (order: Order) =>
	tidyMessage(fillMessage(DEFAULT_ORDER_MESSAGE, orderPlaceholders(order, 'en-IE')));

describe('the default order message', () => {
	it('should list the lines, the total and the customer', () => {
		expect(message({ ...order, note: 'Sliced, please' })).toBe(
			"Hi! I'd like to place an order (A7K-3Q2):\n\n" +
				'2 × Sourdough · €9.00\n1 × Rye · €5.00\n\n€14.00\n\nAda · +44 20 7946 0000\nSliced, please'
		);
	});

	it('should drop the lines an order without a total or note leaves empty', () => {
		expect(message({ ...order, subtotal: undefined })).toBe(
			"Hi! I'd like to place an order (A7K-3Q2):\n\n" +
				'2 × Sourdough · €9.00\n1 × Rye · €5.00\n\nAda · +44 20 7946 0000'
		);
	});
});
