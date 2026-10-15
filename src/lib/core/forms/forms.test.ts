import { describe, expect, it } from 'vitest';
import { hostedFormUrl } from './target.js';
import { fillMessage, whatsappHref, whatsappNumber } from './whatsapp.js';

const formData = (entries: Array<[string, string]>) => {
	const data = new FormData();
	for (const [key, value] of entries) data.append(key, value);
	return data;
};

describe('hostedFormUrl', () => {
	it('should put the form beside a hosted CMS endpoint', () => {
		expect(hostedFormUrl('https://velastack.dev/v1/projects/p1/cms', 'contact')).toBe(
			'https://velastack.dev/v1/projects/p1/forms/contact'
		);
		expect(hostedFormUrl('https://velastack.dev/v1/projects/p1/cms/', 'contact')).toBe(
			'https://velastack.dev/v1/projects/p1/forms/contact'
		);
		expect(hostedFormUrl('/v1/projects/p1/cms', 'book-a-table')).toBe(
			'/v1/projects/p1/forms/book-a-table'
		);
	});

	it('should derive nothing from an endpoint without hosted forms', () => {
		expect(hostedFormUrl('/api/cms', 'contact')).toBeNull();
		expect(hostedFormUrl('/cms', 'contact')).toBeNull();
		expect(hostedFormUrl('', 'contact')).toBeNull();
		expect(hostedFormUrl('https://velastack.dev/v1/projects/p1/cms/docs', 'contact')).toBeNull();
	});

	it('should encode the key', () => {
		expect(hostedFormUrl('/v1/projects/p1/cms', 'a/b')).toBe('/v1/projects/p1/forms/a%2Fb');
	});
});

describe('fillMessage', () => {
	it('should substitute each placeholder with its field', () => {
		const data = formData([
			['name', 'Ada'],
			['guests', '4']
		]);
		expect(fillMessage("Hi, I'm {name}. A table for {guests}.", data)).toBe(
			"Hi, I'm Ada. A table for 4."
		);
	});

	it('should join repeated fields and empty unknown ones', () => {
		const data = formData([
			['extras', 'wine'],
			['extras', 'cake'],
			['extras', '']
		]);
		expect(fillMessage('{extras} / {missing} / {missing}', data)).toBe('wine, cake /  / ');
	});

	it('should leave braces that are not placeholders alone', () => {
		expect(fillMessage('{ spaced } {} {a b}', formData([]))).toBe('{ spaced } {} {a b}');
	});

	it('should skip uploaded files', () => {
		const data = new FormData();
		data.append('photo', new Blob(['x']), 'x.png');
		expect(fillMessage('[{photo}]', data)).toBe('[]');
	});
});

describe('whatsappNumber', () => {
	it('should keep only the digits wa.me accepts', () => {
		expect(whatsappNumber('+1 (555) 010-0199')).toBe('15550100199');
		expect(whatsappNumber('0044 20 7946 0000')).toBe('442079460000');
		expect(whatsappNumber('')).toBe('');
	});
});

describe('whatsappHref', () => {
	it('should link to the number with the message encoded', () => {
		expect(whatsappHref('+1 555 0100', 'Hi & bye?')).toBe(
			'https://wa.me/15550100?text=Hi%20%26%20bye%3F'
		);
	});

	it('should link to the number alone without a message', () => {
		expect(whatsappHref('+1 555 0100')).toBe('https://wa.me/15550100');
	});

	it('should give nothing without a number', () => {
		expect(whatsappHref('', 'Hi')).toBeNull();
		expect(whatsappHref('n/a', 'Hi')).toBeNull();
	});
});
