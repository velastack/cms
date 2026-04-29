import { definePage } from '$lib/components/admin-bar/page-config.js';

export default definePage({
	type: 'Room',
	creatable: true,
	fields: ['title'],
	transform: ({ title }) => ({
		params: {
			slug: title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '')
		},
		metadata: { title }
	}),
	metadata: {
		title: 'string',
		description: 'long-string',
		price_per_night: 'number',
		max_guests: 'number',
		bed_type: { type: 'enum', values: ['king', 'queen', 'twin'] }
	}
});
