/**
 * The structured value shapes behind the editor components. Importing this
 * module registers every schema, so the Locales panel can count translatable
 * strings for any usage the manifest recorded.
 */
export type { FormField, FormFieldType, FormShape, ListValue } from './form.js';
export { defineForm } from './form.js';
export { normalizeLink, asLink, linkHref } from './link.js';
export type { CmsLinkValue } from './link.js';
export { normalizeImage, asImage, asImages } from './image.js';
export type { CmsImageValue } from './image.js';

export { cmsNav, navView, isActive } from './nav.js';
export type { CmsNavValue, NavItem, NavItemView } from './nav.js';

export {
	cmsHours,
	hoursView,
	formatTime,
	formatRanges,
	formatDate,
	dayNames,
	zonedNow,
	toOpeningHoursSpecification,
	DAY_KEYS,
	DEFAULT_HOURS_LABELS
} from './hours.js';
export type {
	CmsHoursValue,
	DayKey,
	DayHours,
	HoursRange,
	HoursException,
	HoursLabels,
	HoursRow,
	HoursToday,
	HoursExceptionRow,
	HoursView
} from './hours.js';

export {
	cmsContact,
	contactView,
	formatAddress,
	telHref,
	whatsappHref,
	toPostalAddress,
	DEFAULT_CONTACT_LABELS
} from './contact.js';
export type {
	CmsContactValue,
	ContactAddress,
	ContactEmail,
	ContactLabels,
	ContactPhone,
	ContactView
} from './contact.js';

export {
	cmsSocialLinks,
	socialLinksView,
	toSameAs,
	SOCIAL_PLATFORMS,
	SOCIAL_PLATFORM_NAMES
} from './social-links.js';
export type {
	CmsSocialLinksValue,
	SocialLink,
	SocialLinkView,
	SocialPlatform
} from './social-links.js';

export { cmsTeam, teamView } from './team.js';
export type { CmsTeamValue, TeamLink, TeamMember } from './team.js';

export { cmsTestimonials, testimonialsView, toReview } from './testimonials.js';
export type { CmsTestimonialsValue, Testimonial } from './testimonials.js';

export {
	cmsCollection,
	collectionView,
	collectionTags,
	formatCollectionPrice,
	toItemList
} from './collection.js';
export type {
	CmsCollectionValue,
	CollectionDetail,
	CollectionItem,
	CollectionItemView,
	CollectionPrice,
	CollectionSlice
} from './collection.js';

export { cmsPricing, pricingView, formatPrice } from './pricing.js';
export type { CmsPricingValue, PricingFeature, PricingTier, PricingTierView } from './pricing.js';

export { cmsFaq, faqView, toFaqPage } from './faq.js';
export type { CmsFaqValue, FaqItem } from './faq.js';

export {
	cmsStats,
	cmsSteps,
	cmsTimeline,
	cmsGallery,
	cmsLogos,
	cmsSchedule,
	logosView,
	scheduleByDay
} from './presets.js';
export type {
	CmsStatsValue,
	StatItem,
	CmsStepsValue,
	StepItem,
	CmsTimelineValue,
	TimelineItem,
	CmsGalleryValue,
	GalleryItem,
	CmsLogosValue,
	LogoItem,
	LogoItemView,
	CmsScheduleValue,
	ScheduleItem
} from './presets.js';
