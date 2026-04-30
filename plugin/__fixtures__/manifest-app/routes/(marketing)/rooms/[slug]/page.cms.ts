export default {
	type: 'Room',
	creatable: true,
	fields: ['title'],
	transform: ({ title }: { title: string }) => ({ params: { slug: title }, metadata: { title } })
};
