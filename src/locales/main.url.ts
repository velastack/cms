export const getLocale = (url: URL) => url.searchParams.get('locale') ?? 'en';
